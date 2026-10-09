/**
 * Workzen — Phase 4: pembuat pesan MIME (RFC 5322/2045/2047) untuk Gmail API.
 * Teks UTF-8 base64, lampiran base64, subjek non-ASCII dengan RFC 2047, header dijaga dari injeksi CRLF.
 */
import { randomBytes } from "node:crypto";
import type { OutgoingMail } from "./mail-types";

const toB64 = (d: Uint8Array | string) =>
  Buffer.from(d as never).toString("base64");
const fold76 = (b64: string) => b64.replace(/(.{76})(?=.)/g, "$1\r\n");

function assertHeaderSafe(name: string, v: string) {
  if (/[\r\n]/.test(v)) throw new Error(`HEADER_INJECTION: ${name}`);
}

/** RFC 2047: pecah per karakter agar tiap encoded-word <= 75 karakter */
export function encodeHeaderValue(v: string): string {
  if (/^[\x20-\x7E]*$/.test(v)) return v;
  const words: string[] = [];
  let cur = "";
  for (const ch of v) {
    if (Buffer.byteLength(cur + ch) > 42) {
      words.push(cur);
      cur = "";
    }
    cur += ch;
  }
  if (cur) words.push(cur);
  return words.map((w) => `=?UTF-8?B?${toB64(w)}?=`).join("\r\n ");
}

const safeFilename = (n: string) =>
  n.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120) || "file";

export function buildMime(mail: OutgoingMail): { mime: string; raw: string } {
  for (const [k, v] of Object.entries({
    subject: mail.subject,
    mid: mail.rfcMessageId,
    irt: mail.inReplyTo ?? "",
  }))
    assertHeaderSafe(k, v);
  for (const a of [...mail.to, ...(mail.cc ?? [])]) {
    assertHeaderSafe("address", a);
    if (!/^[^\s<>,;"]+@[^\s<>,;"]+$/.test(a))
      throw new Error(`INVALID_ADDRESS: ${a}`);
  }
  if (!mail.to.length) throw new Error("NO_RECIPIENT");

  const headers = [
    `To: ${mail.to.join(", ")}`,
    ...(mail.cc?.length ? [`Cc: ${mail.cc.join(", ")}`] : []),
    `Subject: ${encodeHeaderValue(mail.subject)}`,
    `Message-ID: ${mail.rfcMessageId}`,
    ...(mail.inReplyTo
      ? [`In-Reply-To: ${mail.inReplyTo}`, `References: ${mail.inReplyTo}`]
      : []),
    "MIME-Version: 1.0",
  ];

  const textPart = [
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    fold76(toB64(mail.text.replace(/\r?\n/g, "\r\n"))),
  ].join("\r\n");

  let body: string;
  if (mail.attachments?.length) {
    const boundary = `wz_${randomBytes(12).toString("hex")}`;
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    const parts = [textPart];
    for (const a of mail.attachments) {
      const fn = safeFilename(a.filename);
      parts.push(
        [
          `Content-Type: ${a.contentType}; name="${fn}"`,
          "Content-Transfer-Encoding: base64",
          `Content-Disposition: attachment; filename="${fn}"`,
          "",
          fold76(toB64(a.data)),
        ].join("\r\n"),
      );
    }
    body =
      parts.map((p) => `--${boundary}\r\n${p}\r\n`).join("") +
      `--${boundary}--\r\n`;
  } else {
    headers.push(...textPart.split("\r\n").slice(0, 2));
    body = textPart.split("\r\n").slice(3).join("\r\n") + "\r\n";
  }
  const mime = headers.join("\r\n") + "\r\n\r\n" + body;
  const raw = Buffer.from(mime).toString("base64url");
  return { mime, raw };
}
