/**
 * Workzen — Phase 4: adapter DocMailDb di atas supabase-js (service role, server only).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ApprovalOutcome,
  ClaimedEmail,
  DocMailDb,
  DraftAwaiting,
  EmailContext,
  PendingThread,
} from "./mail-types";

async function rpc<T>(
  sb: SupabaseClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export function createSupabaseMailDb(
  sb: SupabaseClient,
  bucket = "documents",
): DocMailDb {
  return {
    claimEmails: async (limit) =>
      (await rpc<ClaimedEmail[]>(sb, "claim_document_emails", {
        p_limit: limit,
      })) ?? [],
    emailContext: (id) =>
      rpc<EmailContext>(sb, "document_email_context", { p_email_id: id }),
    completeEmail: async (a) => {
      await rpc(sb, "complete_document_email", {
        p_id: a.id,
        p_ok: a.ok,
        p_gmail_message_id: a.messageId ?? null,
        p_gmail_thread_id: a.threadId ?? null,
        p_gmail_draft_id: a.draftId ?? null,
        p_error: a.error ?? null,
      });
    },
    cancelEmail: async (id, reason) => {
      await rpc(sb, "cancel_document_email", {
        p_email_id: id,
        p_reason: reason,
      });
    },
    downloadPdf: async (path) => {
      const { data, error } = await sb.storage.from(bucket).download(path);
      if (error || !data)
        throw new Error(`PDF_DOWNLOAD_FAILED: ${error?.message ?? path}`);
      return new Uint8Array(await data.arrayBuffer());
    },
    pendingApprovalThreads: async () =>
      (await rpc<PendingThread[]>(sb, "pending_approval_threads")) ?? [],
    processApprovalReply: (a) =>
      rpc<ApprovalOutcome>(sb, "process_approval_reply", {
        p_gmail_message_id: a.messageId,
        p_gmail_thread_id: a.threadId,
        p_from_email: a.from,
        p_decision: a.decision,
        p_inquiry_no: a.inquiryNo,
        p_version: a.version,
        p_doc_no: a.docNo,
        p_reason: a.reason,
      }),
    draftsAwaitingSend: async () =>
      (await rpc<DraftAwaiting[]>(sb, "drafts_awaiting_send")) ?? [],
    markDocumentSent: async (documentId, gmailMessageId) => {
      await rpc(sb, "mark_document_sent", {
        p_document: documentId,
        p_gmail_message_id: gmailMessageId,
      });
    },
  };
}
