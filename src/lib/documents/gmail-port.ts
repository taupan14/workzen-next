/**
 * Workzen — Phase 4: adapter GmailPort di atas `googleapis`.
 * Scope OAuth yang dibutuhkan (tambahan dari Phase 1–3):
 *   https://www.googleapis.com/auth/gmail.compose   (membuat draft)
 * bersama gmail.readonly / gmail.send yang sudah dipakai. Refresh token harus diambil ulang
 * setelah scope ditambah.
 */
import { google, type gmail_v1 } from "googleapis";
import { buildMime } from "./mime";
import type { GmailPort, InboundMessage, OutgoingMail } from "./mail-types";

const decode = (b64url?: string | null) =>
  b64url ? Buffer.from(b64url, "base64url").toString("utf8") : "";
const htmlToText = (h: string) =>
  h
    .replace(/<(br|\/p|\/div)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

function bodyText(payload?: gmail_v1.Schema$MessagePart | null): string {
  if (!payload) return "";
  let plain = "";
  let html = "";
  const walk = (p: gmail_v1.Schema$MessagePart) => {
    if (p.mimeType === "text/plain" && p.body?.data && !plain)
      plain = decode(p.body.data);
    else if (p.mimeType === "text/html" && p.body?.data && !html)
      html = decode(p.body.data);
    p.parts?.forEach(walk);
  };
  walk(payload);
  return plain || htmlToText(html);
}

function senderEmail(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
): string {
  const from =
    headers?.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
  const m = /<([^>]+)>/.exec(from);
  return (m ? m[1] : from).trim().toLowerCase();
}

export function createGoogleGmailPort(cfg: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  mailbox: string;
}): GmailPort {
  const auth = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret);
  auth.setCredentials({ refresh_token: cfg.refreshToken });
  const gmail = google.gmail({ version: "v1", auth });
  const mailbox = cfg.mailbox.toLowerCase();

  const first = async (query: string) => {
    const l = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 1,
    });
    const m = l.data.messages?.[0];
    return m?.id ? { messageId: m.id, threadId: m.threadId ?? "" } : null;
  };

  return {
    mailbox,
    async send(mail: OutgoingMail) {
      const { raw } = buildMime(mail);
      const r = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw, threadId: mail.threadId },
      });
      if (!r.data.id) throw new Error("GMAIL_SEND_NO_ID");
      return { messageId: r.data.id, threadId: r.data.threadId ?? "" };
    },
    async createDraft(mail: OutgoingMail) {
      const { raw } = buildMime(mail);
      const r = await gmail.users.drafts.create({
        userId: "me",
        requestBody: { message: { raw, threadId: mail.threadId } },
      });
      if (!r.data.id || !r.data.message?.id)
        throw new Error("GMAIL_DRAFT_NO_ID");
      return {
        draftId: r.data.id,
        messageId: r.data.message.id,
        threadId: r.data.message.threadId ?? "",
      };
    },
    findMessage: first,
    async getThread(threadId: string): Promise<InboundMessage[]> {
      const t = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
      });
      return (t.data.messages ?? [])
        .filter((m) => m.id)
        .map((m) => ({
          id: m.id as string,
          threadId,
          from: senderEmail(m.payload?.headers),
          internalDateMs: Number(m.internalDate ?? 0),
          text: bodyText(m.payload),
          labelIds: m.labelIds ?? [],
        }));
    },
    async getLabels(messageId: string) {
      try {
        const r = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "minimal",
        });
        return r.data.labelIds ?? [];
      } catch (e) {
        if ((e as { code?: number }).code === 404) return null;
        throw e;
      }
    },
  };
}
