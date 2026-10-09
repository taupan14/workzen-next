import { serverClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Unduh lampiran. Hak akses ditentukan RLS: baris lampiran hanya terbaca oleh user yang berhak
 * (staf, atau departemen untuk lampiran di thread task miliknya). Setelah itu dibuat tautan unduh 60 detik.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await serverClient();
  const { data: row } = await supabase
    .from("attachments")
    .select("id,filename,storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!row?.storage_path)
    return new Response("Lampiran tidak ditemukan atau belum diproses", {
      status: 404,
    });

  const { data, error } = await adminClient()
    .storage.from("attachments")
    .createSignedUrl(row.storage_path, 60, { download: row.filename });
  if (error || !data)
    return new Response("Gagal membuat tautan unduh", { status: 500 });
  return Response.redirect(data.signedUrl, 302);
}
