/**
 * Workzen — Phase 4: alur email dokumen (approval request, balasan approval, draft customer, bukti Sent).
 * Tiga fungsi inti, masing-masing aman dijalankan berulang (idempotent) dan dijadwalkan Inngest:
 *   dispatchDocumentEmails  -> kirim email approval / buat draft Gmail customer
 *   pollApprovalReplies     -> baca balasan di thread approval -> process_approval_reply
 *   confirmCustomerSent     -> buktikan draft customer benar-benar terkirim -> mark_document_sent
 * Aturan keras: tidak ada status Sent tanpa bukti Gmail; balasan ambigu tidak pernah meloloskan dokumen.
 */
import { parseApprovalReply, type ParsedApproval } from "./parse-approval";
import type {
  DocMailDb,
  EmailContext,
  GmailPort,
  OutgoingMail,
} from "./mail-types";

export interface DispatchSummary {
  sent: number;
  drafted: number;
  reused: number;
  cancelled: number;
  failed: number;
}
export interface PollSummary {
  threads: number;
  processed: number;
  approved: number;
  revisionRequested: number;
  rejected: number;
  autoReplies: number;
  errors: number;
}
export interface ConfirmSummary {
  checked: number;
  sent: number;
  stillDraft: number;
  unknown: number;
}

const errMsg = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).slice(0, 500);
const refToken = (emailId: string) =>
  `wz-${emailId.replace(/-/g, "").slice(0, 10)}`;
const domainOf = (addr: string) => addr.split("@")[1] ?? "workzen.local";
const q = (s: string) => `"${s.replace(/"/g, "")}"`;

/** nama file lampiran untuk customer, mis. Sales_Quote-184_QUO-SHIPMATE-IX-26.pdf */
export function pdfFilename(doc: EmailContext["document"]): string {
  const no = doc.doc_no.replace(/\s*\/\s*/g, "-").replace(/\s+/g, "");
  const prefix = doc.doc_type === "QUO" ? "Sales_Quote" : "EPDA";
  return `${prefix}-${no}${doc.revision > 0 ? `-R${doc.revision}` : ""}.pdf`;
}

// ---------------------------------------------------------------- kirim / buat draft
export async function dispatchDocumentEmails(
  db: DocMailDb,
  gmail: GmailPort,
  opts: { limit?: number } = {},
): Promise<DispatchSummary> {
  const s: DispatchSummary = {
    sent: 0,
    drafted: 0,
    reused: 0,
    cancelled: 0,
    failed: 0,
  };
  const claimed = await db.claimEmails(opts.limit ?? 10);

  for (const c of claimed) {
    try {
      const ctx = await db.emailContext(c.id);
      const { email, document: doc } = ctx;

      // validasi ulang saat kirim: dokumen bisa berubah sejak email diantrekan
      const expected =
        email.kind === "APPROVAL_REQUEST" ? "PENDING_APPROVAL" : "APPROVED";
      if (doc.status !== expected) {
        await db.cancelEmail(email.id, `DOC_STATUS_${doc.status}`);
        s.cancelled++;
        continue;
      }
      if (email.kind === "CUSTOMER_DRAFT" && !ctx.recipient_allowed) {
        await db.cancelEmail(email.id, "RECIPIENT_NOT_ALLOWED");
        s.cancelled++;
        continue;
      }
      if (!doc.pdf_storage_path) {
        await db.cancelEmail(email.id, "PDF_MISSING");
        s.cancelled++;
        continue;
      }

      const pdf = await db.downloadPdf(doc.pdf_storage_path);
      if (
        pdf.byteLength < 100 ||
        String.fromCharCode(...pdf.slice(0, 4)) !== "%PDF"
      ) {
        await db.cancelEmail(email.id, "PDF_INVALID");
        s.cancelled++;
        continue;
      }
      const domain = domainOf(gmail.mailbox);
      const ref = refToken(email.id);
      const mail: OutgoingMail = {
        to: [email.to_email],
        cc: email.cc,
        subject: email.subject,
        // Referensi hanya di email internal (approval); draft customer tidak memuat kode internal.
        text:
          email.kind === "APPROVAL_REQUEST"
            ? `${email.body}\n\nRef: ${ref}`
            : email.body,
        rfcMessageId: `<${ref}@${domain}>`,
        attachments: [
          {
            filename: pdfFilename(doc),
            contentType: "application/pdf",
            data: pdf,
          },
        ],
      };

      if (email.kind === "APPROVAL_REQUEST") {
        const existing = await gmail.findMessage(
          `in:sent to:${email.to_email} ${q(`Ref: ${ref}`)}`,
        );
        if (existing) {
          s.reused++;
          await db.completeEmail({
            id: email.id,
            ok: true,
            messageId: existing.messageId,
            threadId: existing.threadId,
          });
          continue;
        }
        const r = await gmail.send(mail);
        await db.completeEmail({
          id: email.id,
          ok: true,
          messageId: r.messageId,
          threadId: r.threadId,
        });
        s.sent++;
      } else {
        const existing = await gmail.findMessage(
          `in:drafts to:${email.to_email} ${q(doc.doc_no)}`,
        );
        if (existing) {
          s.reused++;
          await db.completeEmail({
            id: email.id,
            ok: true,
            messageId: existing.messageId,
            threadId: existing.threadId,
          });
          continue;
        }
        const r = await gmail.createDraft(mail);
        await db.completeEmail({
          id: email.id,
          ok: true,
          messageId: r.messageId,
          threadId: r.threadId,
          draftId: r.draftId,
        });
        s.drafted++;
      }
    } catch (e) {
      s.failed++;
      await db
        .completeEmail({ id: c.id, ok: false, error: errMsg(e) })
        .catch(() => undefined);
    }
  }
  return s;
}

// ---------------------------------------------------------------- balasan approval
const AUTO_REPLY: Record<string, string> = {
  AMBIGUOUS_DECISION:
    "Balasan Anda belum dapat dibaca sebagai keputusan, sehingga dokumen tetap menunggu approval.\n" +
    "Mohon balas dengan satu baris di awal email:\n  APPROVE <Inquiry ID> v<versi>\natau\n  REVISE <alasan>",
  VERSION_MISMATCH:
    "Versi pada balasan Anda tidak sama dengan versi dokumen yang menunggu approval. Mohon cek versi pada email permintaan lalu balas ulang.",
  STALE_VERSION:
    "Dokumen ini sudah diganti versi baru. Approval untuk versi lama tidak berlaku; mohon review versi terbaru.",
  REVISE_REASON_REQUIRED:
    'Untuk REVISE mohon sertakan alasan, mis. "REVISE harga fresh water terlalu tinggi".',
};

export async function pollApprovalReplies(
  db: DocMailDb,
  gmail: GmailPort,
  opts: { parse?: (body: string) => ParsedApproval } = {},
): Promise<PollSummary> {
  const parse = opts.parse ?? parseApprovalReply;
  const s: PollSummary = {
    threads: 0,
    processed: 0,
    approved: 0,
    revisionRequested: 0,
    rejected: 0,
    autoReplies: 0,
    errors: 0,
  };
  const pending = await db.pendingApprovalThreads();
  const self = gmail.mailbox.toLowerCase();

  for (const p of pending) {
    s.threads++;
    try {
      const sentAt = Date.parse(p.sent_at) - 2000;
      const msgs = (await gmail.getThread(p.thread_id))
        .filter(
          (m) =>
            m.from !== self &&
            !m.labelIds.includes("DRAFT") &&
            m.internalDateMs >= sentAt,
        )
        .sort((a, b) => a.internalDateMs - b.internalDateMs);

      for (const m of msgs) {
        const parsed = parse(m.text);
        const res = await db.processApprovalReply({
          messageId: m.id,
          threadId: p.thread_id,
          from: m.from,
          decision: parsed.decision,
          inquiryNo: parsed.inquiryNo,
          version: parsed.version,
          docNo: parsed.docNo,
          reason: parsed.reason,
        });
        if (res.replay) continue;
        s.processed++;
        if (res.ok) {
          if (res.result === "APPROVED") s.approved++;
          else s.revisionRequested++;
          break; // dokumen sudah berubah status; sisa pesan tidak relevan
        }
        s.rejected++;
        // Balas hanya jika pengirim terbukti approver terdaftar (alasan lain terjadi sebelum cek sender / tidak perlu dibalas).
        const text = res.reason ? AUTO_REPLY[res.reason] : undefined;
        if (text) {
          await gmail.send({
            to: [m.from],
            subject: `Re: [${p.inquiry_no}] Approval dokumen`,
            text,
            rfcMessageId: `<wz-ar-${m.id}@${gmail.mailbox.split("@")[1] ?? "workzen.local"}>`,
            threadId: p.thread_id,
          });
          s.autoReplies++;
        }
      }
    } catch {
      s.errors++; // thread dicoba lagi pada putaran berikutnya
    }
  }
  return s;
}

// ---------------------------------------------------------------- bukti Sent
export async function confirmCustomerSent(
  db: DocMailDb,
  gmail: GmailPort,
): Promise<ConfirmSummary> {
  const s: ConfirmSummary = { checked: 0, sent: 0, stillDraft: 0, unknown: 0 };
  for (const d of await db.draftsAwaitingSend()) {
    s.checked++;
    try {
      let evidence: string | null = null;
      const labels = d.gmail_message_id
        ? await gmail.getLabels(d.gmail_message_id)
        : null;
      if (labels) {
        if (labels.includes("SENT") && !labels.includes("DRAFT"))
          evidence = d.gmail_message_id;
        else {
          s.stillDraft++;
          continue;
        }
      } else {
        // pesan draft sudah tidak ada: dikirim (id baru) atau dihapus. Cari bukti di folder Sent.
        const after = Math.floor(Date.parse(d.created_at) / 1000);
        const found = await gmail.findMessage(
          `in:sent to:${d.to_email} subject:${q(d.subject)} has:attachment after:${after}`,
        );
        evidence = found?.messageId ?? null;
      }
      if (!evidence) {
        s.unknown++;
        continue;
      }
      await db.markDocumentSent(d.document_id, evidence);
      s.sent++;
    } catch {
      s.unknown++;
    }
  }
  return s;
}
