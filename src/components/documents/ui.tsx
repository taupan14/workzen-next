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

// Hanya token tema proyek (mendukung tema gelap): ink, muted, mist, paper, field, rule, brand, warn, danger, ok.
const DOC_STATUS_TONE: Record<string, string> = {
  DRAFT: "border-rule text-muted",
  PENDING_APPROVAL: "border-warn text-warn",
  APPROVED: "border-brand text-brand",
  REVISION_REQUESTED: "border-warn text-warn",
  SENT: "border-ok text-ok",
  SUPERSEDED: "border-rule text-muted line-through",
  CANCELLED: "border-danger text-danger",
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
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${DOC_STATUS_TONE[status] ?? "border-rule text-muted"}`}
    >
      {DOC_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export const Rp = ({ v }: { v: number | string | null | undefined }) =>
  v == null || v === "" ? (
    <span className="text-muted">-</span>
  ) : (
    <span className="tabular-nums">{fmtMoney(Number(v))}</span>
  );

export function Notice({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return (
    <p
      role={err ? "alert" : "status"}
      className={`rounded-md border-l-4 bg-paper px-4 py-3 text-sm ${err ? "border-danger text-danger" : "border-ok text-ok"}`}
    >
      {err ?? msg}
    </p>
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
    <section className="rounded-xl border border-rule bg-paper p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Kelas bersama untuk kontrol formulir agar seragam dengan tema. */
export const inputCls =
  "rounded-md border border-rule bg-field px-2 py-1 text-sm text-ink placeholder:text-muted";
export const btnCls =
  "rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-on-brand transition-colors hover:bg-brand-ink disabled:cursor-not-allowed disabled:opacity-40";
export const btnLightCls =
  "rounded-md border border-rule bg-field px-3 py-1.5 text-sm transition-colors hover:border-brand";
