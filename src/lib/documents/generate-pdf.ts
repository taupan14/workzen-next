/**
 * Workzen — Phase 4: render PDF -> Supabase Storage -> catat di database.
 * Panggil dengan service-role client (server only): Server Action / route handler / fungsi Inngest.
 * Hanya dokumen berstatus DRAFT yang boleh dirender (versi final tidak berubah; revisi = versi baru).
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDocumentForRender } from "./load-document";
import { renderDocumentPdf } from "./render-pdf";

export const DOCUMENTS_BUCKET = "documents";

export async function generateAndAttachPdf(
  sb: SupabaseClient,
  documentId: string,
): Promise<{ path: string; sha256: string; bytes: number }> {
  const { input, meta } = await loadDocumentForRender(sb, documentId);
  if (meta.status !== "DRAFT")
    throw new Error(`DOC_NOT_DRAFT: status ${meta.status}`);

  const logoPng = await readFile(
    path.join(process.cwd(), "public", "brand", "shipmate-logo.png"),
  );
  const bytes = await renderDocumentPdf(input, { logoPng });
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storagePath = `${meta.inquiryId}/${meta.docType}-${meta.docSeq}-v${meta.version}.pdf`;

  const up = await sb.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (up.error) throw new Error(`PDF_UPLOAD_FAILED: ${up.error.message}`);

  const { error } = await sb.rpc("attach_document_pdf", {
    p_document: documentId,
    p_path: storagePath,
    p_sha256: sha256,
  });
  if (error) throw new Error(`PDF_ATTACH_FAILED: ${error.message}`);
  return { path: storagePath, sha256, bytes: bytes.byteLength };
}
