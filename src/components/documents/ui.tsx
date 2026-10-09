import type { ReactNode } from "react";
import { fmtMoney } from "@/lib/documents/render-pdf";

export const DOC_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Menunggu approval",
  APPROVED: "Approved (belum terkirim)",
  REVISION_REQUESTED: "Revisi diminta",
  SENT: "Terkirim",
  SUPERSEDED: "Digantikan versi baru",
  CANCELLED: "Dibatalkan",
};
const DOC_STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800",
  APPROVED: "bg-blue-100 text-blue-800",
  REVISION_REQUESTED: "bg-orange-100 text-orange-800",
  SENT: "bg-green-100 text-green-800",
  SUPERSEDED: "bg-gray-200 text-gray-500",
  CANCELLED: "bg-red-100 text-red-700",
};
export const TREATMENT_LABEL: Record<string, string> = {
  CONFIRMED: "Confirmed",
  ESTIMATE: "Estimate",
  CONDITIONAL: "Bersyarat (tidak masuk total)",
  EXCLUDED: "Excluded (tanpa angka)",
  AS_PER_ACTUAL: "As per actual (tanpa angka)",
};
export const REQUIREMENT_LABEL: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  APPROVED_ESTIMATE: "Approved Estimate",
  NOT_APPLICABLE: "Not Applicable",
  EXCEPTION: "Pengecualian tertulis",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${DOC_STATUS_COLOR[status] ?? "bg-gray-100"}`}
    >
      {DOC_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export const Rp = ({ v }: { v: number | string | null | undefined }) =>
  v == null || v === "" ? (
    <span className="text-gray-400">-</span>
  ) : (
    <span className="tabular-nums">{fmtMoney(Number(v))}</span>
  );

export function Notice({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return (
    <div
      className={`mb-4 rounded border px-3 py-2 text-sm ${err ? "border-red-300 bg-red-50 text-red-800" : "border-green-300 bg-green-50 text-green-800"}`}
    >
      {err ?? msg}
    </div>
  );
}

export function Card({
  title,
  children,
  right,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="mb-6 rounded-lg border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}
