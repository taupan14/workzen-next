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
    <div className="space-y-6">
      <h1 className="mb-1 text-xl font-semibold">
        Dokumen (EPDA &amp; Quotation)
      </h1>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link
          href="/documents"
          className={`rounded border border-rule px-2 py-1 ${!status ? "bg-brand text-on-brand" : ""}`}
        >
          Semua
        </Link>
        {Object.entries(DOC_STATUS_LABEL).map(([k, l]) => (
          <Link
            key={k}
            href={`/documents?status=${k}`}
            className={`rounded border border-rule px-2 py-1 ${status === k ? "bg-brand text-on-brand" : ""}`}
          >
            {l}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-rule bg-paper">
        <table className="w-full text-sm">
          <thead className="bg-mist text-left text-xs uppercase text-muted">
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
                <td colSpan={7} className="p-4 text-center text-muted">
                  Belum ada dokumen.
                </td>
              </tr>
            )}
            {rows.map((d) => (
              <tr key={d.id} className="border-t border-rule">
                <td className="p-2">
                  <Link
                    href={`/documents/${d.id}`}
                    className="text-brand hover:underline"
                  >
                    {d.doc_no}
                  </Link>{" "}
                  <span className="text-xs text-muted">{d.doc_type}</span>
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
                <td className="p-2 text-muted">
                  {new Date(d.created_at).toLocaleDateString("id-ID")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
