import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/documents/auth";
import { getServiceClient } from "@/lib/documents/supabase";
import {
  Card,
  Notice,
  Rp,
  StatusBadge,
  TREATMENT_LABEL,
} from "@/components/documents/ui";
import { createDraft, generatePdf, requestApproval } from "../actions";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const btn =
  "rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-40";
const input = "rounded border px-2 py-1 text-sm";
const fmtTs = (v?: string | null) =>
  v ? new Date(v).toLocaleString("id-ID") : "-";

const APPROVAL_REASON: Record<string, string> = {
  SENDER_NOT_APPROVER: "Pengirim bukan approver terdaftar",
  AMBIGUOUS_DECISION: "Balasan tidak jelas (bukan APPROVE/REVISE)",
  VERSION_MISMATCH: "Versi tidak cocok",
  STALE_VERSION: "Versi sudah digantikan",
  NOT_PENDING: "Dokumen sudah tidak menunggu approval",
  DOC_NOT_FOUND: "Dokumen tidak ditemukan",
  AMBIGUOUS_DOCUMENT: "Dokumen ambigu",
  REVISE_REASON_REQUIRED: "REVISE tanpa alasan",
};

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { id } = await params;
  const { msg, err } = await searchParams;
  const { sb, canManage } = await requireStaff();

  const { data: doc } = await sb
    .from("documents")
    .select("*, inquiries(id, inquiry_no, subject)")
    .eq("id", id)
    .single();
  if (!doc) notFound();
  const inq = doc.inquiries as {
    id: string;
    inquiry_no: string;
    subject: string;
  } | null;

  const [
    { data: lines },
    { data: approvals },
    { data: emails },
    { data: internal },
    { data: allowed },
    { data: events },
  ] = await Promise.all([
    sb
      .from("document_lines")
      .select("*")
      .eq("document_id", id)
      .order("sort_order"),
    sb
      .from("document_approvals")
      .select("*")
      .eq("document_id", id)
      .order("created_at"),
    sb
      .from("document_emails")
      .select(
        "id, kind, to_email, status, attempts, last_error, sent_at, created_at",
      )
      .eq("document_id", id)
      .order("created_at"),
    sb
      .from("document_internal")
      .select("cost_total_idr, margin_total_idr")
      .eq("document_id", id)
      .maybeSingle(),
    sb.from("allowed_recipients").select("email, note").order("email"),
    sb
      .from("workflow_events")
      .select("event_type, created_at, payload")
      .eq("entity_type", "document")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  let pdfUrl: string | null = null;
  if (doc.pdf_storage_path) {
    const { data } = await getServiceClient()
      .storage.from("documents")
      .createSignedUrl(doc.pdf_storage_path, 300);
    pdfUrl = data?.signedUrl ?? null;
  }

  const hasDraftMail = (emails ?? []).some(
    (e: Row) => e.kind === "CUSTOMER_DRAFT" && e.status !== "FAILED",
  );
  const header = (doc.header ?? {}) as Record<string, string>;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <Link
        href={inq ? `/inquiries/${inq.id}/costing` : "/documents"}
        className="text-sm text-gray-500 hover:underline"
      >
        ← Costing {inq?.inquiry_no}
      </Link>
      <div className="mb-4 mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{doc.doc_no}</h1>
        <StatusBadge status={doc.status} />
        <span className="text-sm text-gray-500">
          {doc.doc_type} · v{doc.version}
          {doc.revision > 0 ? ` · rev ${doc.revision}` : ""} ·{" "}
          {doc.customer_name ?? "-"}
        </span>
      </div>
      <Notice msg={msg} err={err} />

      {doc.status === "SUPERSEDED" && (
        <div className="mb-4 rounded border border-gray-300 bg-gray-50 p-3 text-sm">
          Versi ini sudah digantikan. Buka halaman costing untuk versi terbaru.
        </div>
      )}
      {doc.status === "REVISION_REQUESTED" && (
        <div className="mb-4 rounded border border-orange-300 bg-orange-50 p-3 text-sm">
          Approver meminta revisi:{" "}
          <b>
            {(approvals ?? [])
              .filter(
                (a: Row) => a.is_valid && a.result === "REVISION_REQUESTED",
              )
              .at(-1)?.reason ?? "-"}
          </b>
          . Perbaiki di halaman costing lalu buat versi baru.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <Card title="Ringkasan">
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-gray-500">Tanggal</dt>
              <dd>{doc.doc_date}</dd>
              <dt className="text-gray-500">Berlaku sampai</dt>
              <dd>{doc.valid_until ?? "-"}</dd>
              <dt className="text-gray-500">Subtotal</dt>
              <dd>
                <Rp v={doc.subtotal_idr} />
              </dd>
              {doc.tax_amount_idr != null && (
                <>
                  <dt className="text-gray-500">Pajak</dt>
                  <dd>
                    <Rp v={doc.tax_amount_idr} />
                  </dd>
                </>
              )}
              <dt className="text-gray-500">Total</dt>
              <dd>
                <b>
                  <Rp v={doc.total_idr} />
                </b>
              </dd>
              {doc.conditional_idr > 0 && (
                <>
                  <dt className="text-gray-500">Bersyarat (di luar total)</dt>
                  <dd>
                    <Rp v={doc.conditional_idr} />
                  </dd>
                </>
              )}
              {header.vessel_name && (
                <>
                  <dt className="text-gray-500">Vessel</dt>
                  <dd>{header.vessel_name}</dd>
                </>
              )}
              {internal && (
                <>
                  <dt className="text-gray-500">Margin (internal)</dt>
                  <dd className="text-gray-500">
                    <Rp v={internal.margin_total_idr} />
                  </dd>
                </>
              )}
              <dt className="text-gray-500">Disetujui</dt>
              <dd>{fmtTs(doc.approved_at)}</dd>
              <dt className="text-gray-500">Terkirim</dt>
              <dd>
                {fmtTs(doc.sent_at)}
                {doc.sent_message_id ? (
                  <span className="text-xs text-gray-500">
                    {" "}
                    (bukti Gmail: {doc.sent_message_id})
                  </span>
                ) : null}
              </dd>
            </dl>
          </Card>

          {canManage && (
            <Card title="Aksi">
              <div className="flex flex-wrap gap-2">
                <form action={generatePdf}>
                  <input type="hidden" name="document_id" value={id} />
                  <button className={btn} disabled={doc.status !== "DRAFT"}>
                    {doc.pdf_storage_path ? "Buat ulang PDF" : "Buat PDF"}
                  </button>
                </form>
                <form action={requestApproval}>
                  <input type="hidden" name="document_id" value={id} />
                  <button
                    className={btn}
                    disabled={doc.status !== "DRAFT" || !doc.pdf_storage_path}
                  >
                    Minta approval (email)
                  </button>
                </form>
              </div>
              {doc.status === "APPROVED" && !hasDraftMail && (
                <form
                  action={createDraft}
                  className="mt-4 flex flex-wrap items-end gap-2 border-t pt-3"
                >
                  <input type="hidden" name="document_id" value={id} />
                  <label className="text-sm">
                    Kirim ke (alamat uji)
                    <br />
                    <select
                      name="to_email"
                      defaultValue={doc.customer_email ?? ""}
                      className={`${input} w-64`}
                    >
                      {(allowed ?? []).map((a: Row) => (
                        <option key={a.email} value={a.email}>
                          {a.email}
                          {a.note ? ` — ${a.note}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Cc (opsional)
                    <br />
                    <input
                      name="cc"
                      className={`${input} w-52`}
                      placeholder="a@x.test, b@x.test"
                    />
                  </label>
                  <button className={btn}>Buat draft email customer</button>
                </form>
              )}
              {doc.status === "APPROVED" && hasDraftMail && (
                <p className="mt-3 text-sm text-gray-600">
                  Draft sudah dibuat. Periksa dan kirim dari Gmail; status
                  berubah menjadi Terkirim otomatis setelah ada bukti
                  pengiriman.
                </p>
              )}
              {!["DRAFT", "APPROVED"].includes(doc.status) && (
                <p className="mt-3 text-sm text-gray-500">
                  Tidak ada aksi untuk status ini.
                </p>
              )}
            </Card>
          )}

          <Card title="Email dokumen">
            {(emails ?? []).length === 0 ? (
              <p className="text-sm text-gray-500">Belum ada.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {(emails ?? []).map((e: Row) => (
                  <li key={e.id}>
                    <span className="font-medium">
                      {e.kind === "APPROVAL_REQUEST"
                        ? "Permintaan approval"
                        : "Draft customer"}
                    </span>{" "}
                    → {e.to_email} · <b>{e.status}</b>
                    {e.attempts > 0 && (
                      <span className="text-gray-500">
                        {" "}
                        · percobaan {e.attempts}
                      </span>
                    )}
                    {e.last_error && (
                      <span className="text-red-700"> · {e.last_error}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Balasan approval (semua percobaan tercatat)">
            {(approvals ?? []).length === 0 ? (
              <p className="text-sm text-gray-500">Belum ada balasan.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {(approvals ?? []).map((a: Row) => (
                  <li key={a.id} className={a.is_valid ? "" : "text-gray-600"}>
                    {fmtTs(a.created_at)} · {a.from_email} · {a.decision} →
                    <b
                      className={a.is_valid ? "text-green-700" : "text-red-700"}
                    >
                      {" "}
                      {a.is_valid ? a.result : "Ditolak"}
                    </b>
                    {a.reason && (
                      <span> ({APPROVAL_REASON[a.reason] ?? a.reason})</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Riwayat">
            <ul className="space-y-1 text-xs text-gray-600">
              {(events ?? []).map((e: Row, i: number) => (
                <li key={i}>
                  {fmtTs(e.created_at)} · {e.event_type}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div>
          <Card
            title="Pratinjau PDF"
            right={
              pdfUrl ? (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-blue-700 hover:underline"
                >
                  Buka di tab baru
                </a>
              ) : null
            }
          >
            {pdfUrl ? (
              <iframe
                src={pdfUrl}
                title="PDF"
                className="h-[720px] w-full rounded border"
              />
            ) : (
              <p className="text-sm text-gray-500">PDF belum dibuat.</p>
            )}
          </Card>
          <Card title="Isi dokumen (yang terlihat customer)">
            <table className="w-full text-xs">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="py-1">Bagian</th>
                  <th>Deskripsi</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Jumlah (Rp)</th>
                </tr>
              </thead>
              <tbody>
                {(lines ?? []).map((l: Row) => (
                  <tr key={l.id} className="border-t align-top">
                    <td className="py-1 pr-2 text-gray-500">
                      {l.section_code}
                    </td>
                    <td className="pr-2">
                      {l.description}
                      {l.treatment !== "CONFIRMED" && (
                        <span className="ml-1 text-gray-500">
                          [{TREATMENT_LABEL[l.treatment] ?? l.treatment}]
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      {l.qty ?? ""} {l.uom ?? ""}
                    </td>
                    <td className="text-right">
                      <Rp v={l.amount_idr} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </main>
  );
}
