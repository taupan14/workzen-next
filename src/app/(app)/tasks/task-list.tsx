"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Status } from "@/components/status";
import type { Tone } from "@/lib/format";

export type TaskRow = {
  id: string;
  code: string;
  inquiryNo: string;
  subject: string;
  department: string;
  deadlineLabel: string | null;
  statusLabel: string;
  tone: Tone;
  overdue: boolean;
  dueSoon: boolean;
  ackOverdue: boolean;
  review: boolean;
};
type Labels = {
  searchPlaceholder: string;
  count: string;
  empty: string;
  noMatch: string;
  clear: string;
  cols: {
    task: string;
    inquiry: string;
    department: string;
    deadline: string;
    status: string;
  };
  flags: {
    overdue: string;
    dueSoon: string;
    ackOverdue: string;
    review: string;
  };
};

const GRID =
  "md:grid md:grid-cols-[130px_minmax(0,1fr)_150px_140px_150px] md:items-center md:gap-4";
const chip = (c: string) =>
  `inline-block rounded-full bg-mist px-2 py-0.5 text-xs ${c}`;

export function TaskList({
  rows,
  labels,
}: {
  rows: TaskRow[];
  labels: Labels;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n
      ? rows.filter((r) =>
          `${r.code} ${r.inquiryNo} ${r.subject} ${r.department}`
            .toLowerCase()
            .includes(n),
        )
      : rows;
  }, [rows, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative block w-full max-w-md">
          <span className="sr-only">{labels.searchPlaceholder}</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={labels.searchPlaceholder}
            className="w-full rounded-md border border-rule bg-field py-2 pl-9 pr-9 text-sm placeholder:text-muted/70 focus-visible:border-brand"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label={labels.clear}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </label>
        <p className="text-sm text-muted" aria-live="polite">
          {labels.count.replace("{n}", String(shown.length))}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-rule bg-paper">
        <div
          className={`hidden border-b border-rule px-4 py-2 text-sm text-muted ${GRID}`}
        >
          <span>{labels.cols.task}</span>
          <span>{labels.cols.inquiry}</span>
          <span>{labels.cols.department}</span>
          <span>{labels.cols.deadline}</span>
          <span>{labels.cols.status}</span>
        </div>
        <ul className="divide-y divide-rule">
          {shown.map((r) => (
            <li
              key={r.id}
              onClick={() => router.push(`/tasks/${r.id}`)}
              className={`cursor-pointer px-4 py-3 text-sm transition-colors hover:bg-mist ${GRID}`}
            >
              <Link
                href={`/tasks/${r.id}`}
                onClick={(e) => e.stopPropagation()}
                className="block font-medium hover:underline"
              >
                {r.code}
              </Link>
              <span className="block min-w-0">
                <span className="block truncate">{r.subject}</span>
                <span className="block text-xs text-muted">{r.inquiryNo}</span>
                {(r.overdue || r.dueSoon || r.ackOverdue || r.review) && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {r.overdue && (
                      <span className={chip("text-danger")}>
                        {labels.flags.overdue}
                      </span>
                    )}
                    {r.dueSoon && (
                      <span className={chip("text-warn")}>
                        {labels.flags.dueSoon}
                      </span>
                    )}
                    {r.ackOverdue && (
                      <span className={chip("text-warn")}>
                        {labels.flags.ackOverdue}
                      </span>
                    )}
                    {r.review && (
                      <span className={chip("text-brand")}>
                        {labels.flags.review}
                      </span>
                    )}
                  </span>
                )}
              </span>
              <span className="block text-muted md:text-ink">
                {r.department}
              </span>
              <span
                className={`block ${r.overdue ? "font-medium text-danger" : "text-muted md:text-ink"}`}
              >
                {r.deadlineLabel ?? "—"}
              </span>
              <span className="mt-1 block md:mt-0">
                <Status label={r.statusLabel} tone={r.tone} />
              </span>
            </li>
          ))}
        </ul>
        {!shown.length && (
          <p className="px-4 py-8 text-muted">
            {rows.length ? labels.noMatch : labels.empty}
          </p>
        )}
      </div>
    </div>
  );
}
