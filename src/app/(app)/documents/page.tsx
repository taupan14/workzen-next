import Link from "next/link";
import { requireStaff } from "@/lib/documents/auth";
import { DOC_STATUS_LABEL, Rp, StatusBadge } from "@/components/documents/ui";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const { sb } = await requireStaff();

  let query = sb
    .from("documents")
    .select(
      "id, doc_no, doc_type, version, revision, status, customer_name, total_idr, created_at, approved_at, sent_at, inquiries(inquiry_no)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && status in DOC_STATUS_LABEL) query = query.eq("status", status);
  const { data } = await query;
  const rows = (data ?? []) as Row[];

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-xl font-semibold">
        Dokumen (EPDA &amp; Quotation)
      </h1>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link
          href="/documents"
          className={`rounded border px-2 py-1 ${!status ? "bg-gray-900 text-white" : ""}`}
        >
          Semua
        </Link>
        {Object.entries(DOC_STATUS_LABEL).map(([k, l]) => (
          <Link
            key={k}
            href={`/documents?status=${k}`}
            className={`rounded border px-2 py-1 ${status === k ? "bg-gray-900 text-white" : ""}`}
          >
            {l}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="p-2">Nomor</th>
              <th className="p-2">Inquiry</th>
              <th className="p-2">Customer</th>
              <th className="p-2">Versi</th>
              <th className="p-2 text-right">Total (Rp)</th>
              <th className="p-2">Status</th>
              <th className="p-2">Dibuat</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">
                  Belum ada dokumen.
                </td>
              </tr>
            )}
            {rows.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="p-2">
                  <Link
                    href={`/documents/${d.id}`}
                    className="text-blue-700 hover:underline"
                  >
                    {d.doc_no}
                  </Link>{" "}
                  <span className="text-xs text-gray-500">{d.doc_type}</span>
                </td>
                <td className="p-2">
                  {(d.inquiries as { inquiry_no?: string } | null)
                    ?.inquiry_no ?? "-"}
                </td>
                <td className="p-2">{d.customer_name ?? "-"}</td>
                <td className="p-2">
                  v{d.version}
                  {d.revision > 0 ? ` · rev ${d.revision}` : ""}
                </td>
                <td className="p-2 text-right">
                  <Rp v={d.total_idr} />
                </td>
                <td className="p-2">
                  <StatusBadge status={d.status} />
                </td>
                <td className="p-2 text-gray-500">
                  {new Date(d.created_at).toLocaleDateString("id-ID")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
