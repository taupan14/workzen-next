/**
 * Workzen — Phase 4: adapter GmailPort di atas klien Gmail proyek (@/lib/gmail/client).
 * Scope OAuth tambahan yang dibutuhkan: https://www.googleapis.com/auth/gmail.compose (membuat draft);
 * refresh token harus diambil ulang setelah scope ditambah.
 */
import type { gmail_v1 } from "googleapis";
import { gmailClient, mailbox, parseMessage } from "@/lib/gmail/client";
import { buildMime } from "./mime";
import type { GmailPort, InboundMessage, OutgoingMail } from "./mail-types";

/** Pesan Gmail API -> pesan masuk yang dipakai alur approval (memakai parser proyek, termasuk fallback HTML). */
export function messageToInbound(m: gmail_v1.Schema$Message): InboundMessage {
  const p = parseMessage(m);
  return {
    id: p.gmail_message_id,
    threadId: p.gmail_thread_id,
    from: p.from_email,
    internalDateMs: p.received_ms,
    text: p.body_text,
    labelIds: m.labelIds ?? [],
  };
}

export function createGmailPort(
  gmail: gmail_v1.Gmail = gmailClient(),
  box: string = mailbox(),
): GmailPort {
  return {
    mailbox: box.toLowerCase(),
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
    async findMessage(query: string) {
      const l = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 1,
      });
      const m = l.data.messages?.[0];
      return m?.id ? { messageId: m.id, threadId: m.threadId ?? "" } : null;
    },
    async getThread(threadId: string): Promise<InboundMessage[]> {
      const t = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
      });
      return (t.data.messages ?? [])
        .filter((m) => m.id && m.threadId)
        .map(messageToInbound);
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
