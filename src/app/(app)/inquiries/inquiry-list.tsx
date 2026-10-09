"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Status } from "@/components/status";
import type { Tone } from "@/lib/format";

export type Row = {
  id: string; no: string; subject: string; customer: string; email: string;
  receivedLabel: string; statusLabel: string; tone: Tone;
};
type Labels = {
  searchPlaceholder: string; count: string; empty: string; noMatch: string; clear: string;
  cols: { no: string; subject: string; customer: string; received: string; status: string };
};

const GRID = "md:grid md:grid-cols-[90px_minmax(0,1fr)_200px_150px_140px] md:items-center md:gap-4";

export function InquiryList({ rows, labels }: { rows: Row[]; labels: Labels }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => `${r.no} ${r.subject} ${r.customer} ${r.email}`.toLowerCase().includes(needle));
  }, [rows, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative block w-full max-w-md">
          <span className="sr-only">{labels.searchPlaceholder}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={labels.searchPlaceholder}
            className="w-full rounded-md border border-rule bg-field py-2 pl-9 pr-9 text-sm transition-colors placeholder:text-muted/70 focus-visible:border-brand"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label={labels.clear} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink">
              <X className="size-4" aria-hidden />
            </button>
          )}
        </label>
        <p className="text-sm text-muted" aria-live="polite">{labels.count.replace("{n}", String(shown.length))}</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-rule bg-paper">
        <div className={`hidden border-b border-rule px-4 py-2 text-sm text-muted ${GRID}`}>
          <span>{labels.cols.no}</span><span>{labels.cols.subject}</span><span>{labels.cols.customer}</span>
          <span>{labels.cols.received}</span><span>{labels.cols.status}</span>
        </div>
        <ul className="divide-y divide-rule">
          {shown.map((r) => (
            <li
              key={r.id}
              onClick={() => router.push(`/inquiries/${r.id}`)}
              className={`cursor-pointer px-4 py-3 text-sm transition-colors hover:bg-mist ${GRID}`}
            >
              <span className="text-muted md:text-ink">{r.no}</span>
              <Link href={`/inquiries/${r.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium hover:underline">{r.subject}</Link>
              <span className="block truncate text-muted md:text-ink">{r.customer}</span>
              <span className="block text-muted md:text-ink">{r.receivedLabel}</span>
              <span className="mt-1 block md:mt-0"><Status label={r.statusLabel} tone={r.tone} /></span>
            </li>
          ))}
        </ul>
        {!shown.length && <p className="px-4 py-8 text-muted">{rows.length ? labels.noMatch : labels.empty}</p>}
      </div>
    </div>
  );
}
