/**
 * Workzen — Phase 4: kontrak (port) untuk alur email dokumen.
 * Logika alur (mail-flow.ts) hanya bergantung pada dua antarmuka ini, sehingga bisa diuji
 * tanpa Gmail/Supabase sungguhan dan klien Gmail yang sudah ada di proyek dapat dipasang
 * dengan menulis adapter tipis.
 */
export interface Attachment {
  filename: string;
  contentType: string;
  data: Uint8Array;
}

export interface OutgoingMail {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  /** Message-ID RFC 5322 (dengan <>) */
  rfcMessageId: string;
  /** balasan dalam thread yang sudah ada */
  threadId?: string;
  inReplyTo?: string;
  attachments?: Attachment[];
}

export interface InboundMessage {
  id: string;
  threadId: string;
  /** alamat email pengirim, huruf kecil */
  from: string;
  internalDateMs: number;
  text: string;
  labelIds: string[];
}

export interface GmailPort {
  /** alamat mailbox gateway, huruf kecil */
  mailbox: string;
  send(mail: OutgoingMail): Promise<{ messageId: string; threadId: string }>;
  createDraft(
    mail: OutgoingMail,
  ): Promise<{ draftId: string; messageId: string; threadId: string }>;
  /** pencarian dengan sintaks Gmail; kembalikan pesan pertama yang cocok atau null */
  findMessage(
    query: string,
  ): Promise<{ messageId: string; threadId: string } | null>;
  getThread(threadId: string): Promise<InboundMessage[]>;
  /** label pesan; null bila pesan sudah tidak ada (mis. draft sudah dikirim/dihapus) */
  getLabels(messageId: string): Promise<string[] | null>;
}

export type EmailKind = "APPROVAL_REQUEST" | "CUSTOMER_DRAFT";

export interface ClaimedEmail {
  id: string;
  kind: EmailKind;
}

export interface EmailContext {
  email: {
    id: string;
    kind: EmailKind;
    to_email: string;
    cc: string[];
    subject: string;
    body: string;
    attach_pdf: boolean;
  };
  document: {
    id: string;
    doc_no: string;
    doc_type: "EPDA" | "QUO";
    doc_seq: number;
    version: number;
    revision: number;
    status: string;
    pdf_storage_path: string | null;
    inquiry_no: string;
    valid_until: string | null;
  };
  recipient_allowed: boolean;
}

export interface PendingThread {
  document_id: string;
  email_id: string;
  thread_id: string;
  to_email: string;
  sent_at: string;
  inquiry_no: string;
  doc_version: number;
}

export interface DraftAwaiting {
  document_id: string;
  email_id: string;
  gmail_draft_id: string | null;
  gmail_message_id: string | null;
  to_email: string;
  subject: string;
  doc_no: string;
  created_at: string;
}

export interface ApprovalOutcome {
  ok: boolean;
  result: string;
  reason: string | null;
  replay: boolean;
}

export interface DocMailDb {
  claimEmails(limit: number): Promise<ClaimedEmail[]>;
  emailContext(emailId: string): Promise<EmailContext>;
  completeEmail(a: {
    id: string;
    ok: boolean;
    messageId?: string | null;
    threadId?: string | null;
    draftId?: string | null;
    error?: string | null;
  }): Promise<void>;
  cancelEmail(emailId: string, reason: string): Promise<void>;
  downloadPdf(storagePath: string): Promise<Uint8Array>;
  pendingApprovalThreads(): Promise<PendingThread[]>;
  processApprovalReply(a: {
    messageId: string;
    threadId: string;
    from: string;
    decision: "APPROVE" | "REVISE" | "UNKNOWN";
    inquiryNo: string | null;
    version: number | null;
    docNo: string | null;
    reason: string | null;
  }): Promise<ApprovalOutcome>;
  draftsAwaitingSend(): Promise<DraftAwaiting[]>;
  markDocumentSent(documentId: string, gmailMessageId: string): Promise<void>;
}
