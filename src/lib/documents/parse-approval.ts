/**
 * Workzen — Phase 4: parser balasan approval.
 * Aturan (brief ShipMate): hanya teks BARU yang dibaca (abaikan kutipan & signature); format
 *   APPROVE [Inquiry ID] [versi]   atau   REVISE <alasan>
 * Balasan yang tidak jelas -> UNKNOWN (tidak pernah meloloskan dokumen). Keputusan akhir tetap
 * diambil process_approval_reply() di database (sender, versi, status).
 */
export type ApprovalDecision = "APPROVE" | "REVISE" | "UNKNOWN";

export interface ParsedApproval {
  decision: ApprovalDecision;
  inquiryNo: string | null;
  version: number | null;
  docNo: string | null;
  reason: string | null;
  /** teks baru yang dibaca parser (untuk audit) */
  newText: string;
}

const QUOTE_START = [
  /^\s*>/, // baris kutipan
  /^\s*-{2,}\s*original message\s*-{2,}/i,
  /^\s*on .{5,200}wrote:\s*$/i, // "On Mon, ... wrote:"
  /^\s*pada .{5,200}menulis:\s*$/i, // "Pada Sen, ... menulis:"
  /^\s*from:\s.+/i, // header kutipan
  /^\s*dari:\s.+/i,
  /^\s*-- ?$/, // pemisah signature
];

export function stripQuotedHistory(body: string): string {
  const out: string[] = [];
  for (const line of body.replace(/\r\n?/g, "\n").split("\n")) {
    if (QUOTE_START.some((re) => re.test(line))) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

const DECISION_RE = /^\s*(approve|approved|revise|revisi)\b[\s:,-]*(.*)$/i;
const ANY_KEYWORD_RE = /\b(approve|approved|revise|revisi)\b/gi;

export function parseApprovalReply(
  body: string,
  opts: { inquiryNoPattern?: RegExp; docNoPattern?: RegExp } = {},
): ParsedApproval {
  const inquiryRe = opts.inquiryNoPattern ?? /\b[A-Z]{2,6}-\d{3,}\b/;
  const docNoRe =
    opts.docNoPattern ?? /\b\d+\/\s*(?:EPDA|QUO)-[A-Z0-9-]+\/[IVX]+-\d{2}\b/;
  const newText = stripQuotedHistory(body);
  const unknown: ParsedApproval = {
    decision: "UNKNOWN",
    inquiryNo: null,
    version: null,
    docNo: null,
    reason: null,
    newText,
  };

  const firstLine = newText.split("\n").find((l) => l.trim() !== "");
  if (!firstLine) return unknown;
  const m = DECISION_RE.exec(firstLine);
  if (!m) return unknown; // kata kunci harus di awal baris pertama ("jangan approve dulu" tidak lolos)

  const first = m[1].toLowerCase();
  const decision: ApprovalDecision = first.startsWith("approve")
    ? "APPROVE"
    : "REVISE";
  const rest = m[2].trim();

  // teks baru yang memuat dua keputusan berbeda dianggap ambigu
  const kinds = new Set(
    (newText.match(ANY_KEYWORD_RE) ?? []).map((k) =>
      k.toLowerCase().startsWith("approve") ? "A" : "R",
    ),
  );
  if (kinds.size > 1) return { ...unknown, newText };

  const inquiryNo = inquiryRe.exec(rest)?.[0] ?? null;
  const docNo = docNoRe.exec(rest)?.[0]?.replace(/\/\s+/, "/ ") ?? null;
  const vm =
    /\bv(?:ersi|ersion)?\.?\s*(\d{1,3})\b/i.exec(rest) ??
    (inquiryNo ? new RegExp(`${inquiryNo}\\s+(\\d{1,3})\\b`).exec(rest) : null);
  const version = vm ? Number(vm[1]) : null;

  if (decision === "APPROVE") {
    return { decision, inquiryNo, version, docNo, reason: null, newText };
  }
  // REVISE: alasan = sisa baris pertama (tanpa token ID/versi) + baris berikutnya
  const tail = newText
    .split("\n")
    .slice(newText.split("\n").indexOf(firstLine) + 1)
    .join("\n");
  let reasonFirst = rest;
  for (const tok of [inquiryNo, docNo, vm?.[0]])
    if (tok) reasonFirst = reasonFirst.replace(tok, "");
  const reason =
    `${reasonFirst.replace(/^[\s:,-]+/, "")}\n${tail}`.trim() || null;
  return { decision, inquiryNo, version, docNo, reason, newText };
}
