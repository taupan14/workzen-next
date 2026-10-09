import { google, type gmail_v1 } from "googleapis";

export const mailbox = () => (process.env.GMAIL_MAILBOX ?? "").toLowerCase();

export function gmailClient(): gmail_v1.Gmail {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth });
}

/** ID pesan inbox 7 hari terakhir. Idempotency dijamin DB, jadi window ini aman di-poll berulang. */
export async function listRecentMessageIds(max = 50): Promise<string[]> {
  const q = [
    "in:inbox",
    "-from:me",
    "newer_than:7d",
    process.env.GMAIL_INTAKE_QUERY ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const res = await gmailClient().users.messages.list({
    userId: "me",
    q,
    maxResults: max,
  });
  return (res.data.messages ?? []).map((m) => m.id!).filter(Boolean);
}

export async function fetchParsedMessage(id: string) {
  const res = await gmailClient().users.messages.get({
    userId: "me",
    id,
    format: "full",
  });
  return parseMessage(res.data);
}

/**
 * Unduh isi lampiran. attachmentId dari Gmail tidak stabil antar pemanggilan, jadi pesan diambil ulang
 * dan bagian lampiran dicari lewat nama file (dan ukuran bila ada beberapa nama sama).
 */
export async function fetchAttachmentBuffer(
  messageId: string,
  filename: string,
  size: number | null,
): Promise<Buffer | null> {
  const gmail = gmailClient();
  const msg = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });
  const found: gmail_v1.Schema$MessagePart[] = [];
  const walk = (p?: gmail_v1.Schema$MessagePart) => {
    if (!p) return;
    if (p.filename === filename && p.body?.attachmentId) found.push(p);
    p.parts?.forEach(walk);
  };
  walk(msg.data.payload ?? undefined);
  const part =
    found.find((p) => size == null || p.body?.size === size) ?? found[0];
  if (!part?.body?.attachmentId) return null;
  const res = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: part.body.attachmentId,
  });
  return Buffer.from(res.data.data ?? "", "base64url");
}

// ---------- parsing ----------
export type ParsedEmail = {
  gmail_message_id: string;
  gmail_thread_id: string;
  rfc_message_id: string | null;
  from_email: string;
  from_name: string | null;
  to_emails: string[];
  subject: string;
  body_text: string;
  received_ms: number;
  attachments: {
    filename: string;
    mime_type: string | null;
    size: number;
    attachment_id: string;
  }[];
};

const decode = (data: string) =>
  Buffer.from(data, "base64url").toString("utf-8");

function htmlToText(html: string) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseAddress(raw: string) {
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  return { name: null, email: raw.trim().toLowerCase() };
}

export function parseMessage(msg: gmail_v1.Schema$Message): ParsedEmail {
  const headers = new Map(
    (msg.payload?.headers ?? []).map((h) => [
      h.name!.toLowerCase(),
      h.value ?? "",
    ]),
  );
  const text: string[] = [];
  const html: string[] = [];
  const attachments: ParsedEmail["attachments"] = [];

  const walk = (part?: gmail_v1.Schema$MessagePart) => {
    if (!part) return;
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mime_type: part.mimeType ?? null,
        size: part.body.size ?? 0,
        attachment_id: part.body.attachmentId,
      });
    } else if (part.mimeType === "text/plain" && part.body?.data) {
      text.push(decode(part.body.data));
    } else if (part.mimeType === "text/html" && part.body?.data) {
      html.push(decode(part.body.data));
    }
    part.parts?.forEach(walk);
  };
  walk(msg.payload ?? undefined);

  const from = parseAddress(headers.get("from") ?? "");
  const to =
    (headers.get("to") ?? "")
      .match(/[\w.+-]+@[\w-]+\.[\w.-]+/g)
      ?.map((s) => s.toLowerCase()) ?? [];
  const body = (text.join("\n").trim() || htmlToText(html.join("\n"))).slice(
    0,
    100_000,
  );

  return {
    gmail_message_id: msg.id!,
    gmail_thread_id: msg.threadId!,
    rfc_message_id: headers.get("message-id") ?? null,
    from_email: from.email,
    from_name: from.name,
    to_emails: to,
    subject: headers.get("subject") ?? "",
    body_text: body,
    received_ms: Number(msg.internalDate ?? Date.now()),
    attachments,
  };
}
