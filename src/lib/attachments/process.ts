import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAttachmentBuffer } from "@/lib/gmail/client";
import { MAX_ATTACHMENT_BYTES, extractText } from "./extract";

export type PendingAttachment = {
  id: string;
  inquiry_id: string | null;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  gmail_message_id: string;
};

const safeName = (n: string) =>
  n.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "file";

/** Lampiran berstatus PENDING (atau FAILED yang layak dicoba lagi) dari satu inquiry atau satu email. */
export async function listPendingAttachments(
  db: SupabaseClient,
  filter: { inquiryId?: string; emailMessageId?: string },
): Promise<PendingAttachment[]> {
  let q = db
    .from("attachments")
    .select(
      "id,inquiry_id,filename,mime_type,size_bytes,email_messages!inner(gmail_message_id)",
    )
    .in("process_status", ["PENDING", "FAILED"]);
  if (filter.inquiryId) q = q.eq("inquiry_id", filter.inquiryId);
  if (filter.emailMessageId)
    q = q.eq("email_message_id", filter.emailMessageId);
  const { data, error } = await q;
  if (error) throw new Error(`daftar lampiran: ${error.message}`);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    inquiry_id: r.inquiry_id,
    filename: r.filename,
    mime_type: r.mime_type,
    size_bytes: r.size_bytes,
    gmail_message_id: r.email_messages.gmail_message_id,
  }));
}

/** Unduh dari Gmail, simpan ke Storage privat, ekstrak teks, catat hasilnya. Tidak melempar untuk file yang tidak bisa dibaca. */
export async function processAttachment(
  db: SupabaseClient,
  a: PendingAttachment,
): Promise<{ id: string; status: string }> {
  const save = async (p: Record<string, unknown>) => {
    const { error } = await db.rpc("save_attachment_result", { p_id: a.id, p });
    if (error) throw new Error(`simpan hasil lampiran: ${error.message}`);
  };

  if ((a.size_bytes ?? 0) > MAX_ATTACHMENT_BYTES) {
    await save({
      status: "SKIPPED",
      error: `Lebih dari ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB`,
    });
    return { id: a.id, status: "SKIPPED" };
  }

  const buf = await fetchAttachmentBuffer(
    a.gmail_message_id,
    a.filename,
    a.size_bytes,
  );
  if (!buf) {
    await save({
      status: "FAILED",
      error: "Lampiran tidak ditemukan di Gmail",
    });
    return { id: a.id, status: "FAILED" };
  }
  if (buf.length > MAX_ATTACHMENT_BYTES) {
    await save({
      status: "SKIPPED",
      error: `Lebih dari ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB`,
    });
    return { id: a.id, status: "SKIPPED" };
  }

  const sha256 = createHash("sha256").update(buf).digest("hex");
  const path = `${a.inquiry_id ?? "tanpa-inquiry"}/${a.id}/${safeName(a.filename)}`;
  const up = await db.storage
    .from("attachments")
    .upload(path, buf, {
      contentType: a.mime_type ?? "application/octet-stream",
      upsert: true,
    });
  if (up.error) throw new Error(`upload storage: ${up.error.message}`); // dicoba ulang oleh Inngest

  const r = await extractText(buf, a.filename, a.mime_type);
  if (r.status === "DONE")
    await save({
      status: "DONE",
      text: r.text,
      chars: r.text.length,
      sha256,
      storage_path: path,
    });
  else
    await save({
      status: r.status,
      error: r.error,
      sha256,
      storage_path: path,
    });
  return { id: a.id, status: r.status };
}
