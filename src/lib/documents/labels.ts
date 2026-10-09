/**
 * Label Phase 4 (id/en) untuk dashboard, detail inquiry, dan daftar aktivitas.
 * Bila ingin mengikuti pola i18n proyek, pindahkan isinya ke kamus di src/lib/i18n.
 */
const ID = {
  title: "Costing & Dokumen",
  pendingApproval: "Menunggu approval",
  approvedUnsent: "Approved, belum terkirim",
  revisions: "Permintaan revisi",
  docEmailFailed: "Email dokumen gagal",
  costingLink: "Costing & Dokumen",
  documentsTitle: "Dokumen",
  documentsEmpty: "Belum ada dokumen. Buat dari halaman Costing & Dokumen.",
};
const EN: typeof ID = {
  title: "Costing & Documents",
  pendingApproval: "Awaiting approval",
  approvedUnsent: "Approved, not sent",
  revisions: "Revision requests",
  docEmailFailed: "Document emails failed",
  costingLink: "Costing & Documents",
  documentsTitle: "Documents",
  documentsEmpty:
    "No documents yet. Create them from the Costing & Documents page.",
};

const EVENTS_ID: Record<string, string> = {
  document_compiled: "Dokumen dibuat",
  document_pdf_attached: "PDF dokumen dibuat",
  approval_requested: "Approval diminta",
  approval_reply: "Balasan approval diterima",
  document_sent: "Dokumen terkirim ke customer",
  documents_invalidated: "Dokumen dibatalkan karena revisi",
  revision_requested: "Permintaan revisi dibuat",
  customer_draft_queued: "Draft email customer diantrekan",
  document_email_cancelled: "Email dokumen dibatalkan",
};
const EVENTS_EN: Record<string, string> = {
  document_compiled: "Document compiled",
  document_pdf_attached: "Document PDF generated",
  approval_requested: "Approval requested",
  approval_reply: "Approval reply received",
  document_sent: "Document sent to customer",
  documents_invalidated: "Documents invalidated by revision",
  revision_requested: "Revision request created",
  customer_draft_queued: "Customer email draft queued",
  document_email_cancelled: "Document email cancelled",
};

export const p4Labels = (lang: string) => (lang === "en" ? EN : ID);
/** Label event Phase 4; undefined bila bukan event Phase 4 (biarkan pemanggil memakai fallback). */
export const p4EventLabel = (lang: string, type: string): string | undefined =>
  (lang === "en" ? EVENTS_EN : EVENTS_ID)[type];
