"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  Copy,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import type { Dict } from "@/lib/i18n/dictionaries";
import { PollWhilePending } from "@/components/pool-while-pending";

export type AiItem = {
  id: string;
  kind: "FIELD" | "REQUIREMENT";
  key: string;
  label: string;
  value: string | null;
  unit: string | null;
  department_code: string | null;
  confidence: number | null;
  source_text: string | null;
  source_verified: boolean | null;
  is_missing: boolean;
  question: string | null;
  status: "PENDING" | "ACCEPTED" | "EDITED" | "REJECTED";
  final_value: string | null;
  final_department: string | null;
};

export type AiExtraction = {
  id: string;
  summary: string | null;
  classification: string;
  overall_confidence: number | null;
  prompt_version: string;
  model: string;
};

type Strings = Omit<
  Dict["ai"],
  "attachmentsNote" | "acceptConfidentHint" | "analyzedAt" | "acceptedCount"
>;
type Res = { error?: string; count?: number };

type Props = {
  aiStatus: "NONE" | "PENDING" | "READY" | "FAILED";
  aiError: string | null;
  extraction: AiExtraction | null;
  items: AiItem[];
  departments: { code: string; name: string }[];
  thresholdPct: number;
  strings: Strings;
  errors: Record<string, string>;
  attachmentsNote: string | null;
  acceptHint: string;
  analyzedAt: string | null;
  clarification: string;
  notice: string | null;
  acceptedCountTemplate: { some: string; none: string };
  reviewAction: (
    itemId: string,
    action: "ACCEPT" | "EDIT" | "REJECT" | "RESET",
    value?: string,
    department?: string,
  ) => Promise<Res>;
  acceptConfidentAction: (extractionId: string) => Promise<Res>;
  reanalyzeAction: () => Promise<Res>;
  dismissAction: () => Promise<Res | void>;
};

const btn =
  "inline-flex items-center gap-1 rounded-md border border-rule bg-field px-2 py-1 text-xs transition-colors hover:border-brand disabled:opacity-50";
const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-on-brand transition hover:bg-brand-ink active:scale-[.98] disabled:opacity-50";
const field =
  "w-full rounded-md border border-rule bg-field px-3 py-2 text-sm transition-colors placeholder:text-muted/70 focus-visible:border-brand";

function Confidence({
  value,
  thresholdPct,
}: {
  value: number | null;
  thresholdPct: number;
}) {
  if (value === null) return null;
  const pct = Math.round(value * 100);
  const tone =
    pct >= thresholdPct ? "bg-ok" : pct >= 60 ? "bg-warn" : "bg-danger";
  return (
    <span
      className="inline-flex items-center gap-2 text-xs text-muted"
      title={`${pct}%`}
    >
      <span
        className="h-1.5 w-16 overflow-hidden rounded-full bg-rule"
        aria-hidden
      >
        <span className={`block h-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular-nums">{pct}%</span>
    </span>
  );
}

function ItemRow(props: {
  item: AiItem;
  s: Strings;
  errors: Record<string, string>;
  departments: { code: string; name: string }[];
  thresholdPct: number;
  review: Props["reviewAction"];
}) {
  const { item, s, errors, departments, thresholdPct, review } = props;
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(item.final_value ?? item.value ?? "");
  const [dept, setDept] = useState(
    item.final_department ?? item.department_code ?? "",
  );
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const act = (
    action: "ACCEPT" | "EDIT" | "REJECT" | "RESET",
    value?: string,
    department?: string,
  ) =>
    start(async () => {
      setErr(null);
      const r = await review(item.id, action, value, department);
      if (r.error) setErr(errors[r.error] ?? errors.UNKNOWN);
      else setEditing(false);
    });

  const isReq = item.kind === "REQUIREMENT";
  const label = isReq ? item.label : (s.fields[item.key] ?? item.label);
  const shown =
    item.status === "EDITED" || item.status === "ACCEPTED"
      ? (item.final_value ?? item.value)
      : item.value;
  const deptShown = item.final_department ?? item.department_code;
  const deptName = departments.find((d) => d.code === deptShown)?.name;
  const statusTone =
    item.status === "ACCEPTED"
      ? "text-ok"
      : item.status === "EDITED"
        ? "text-brand"
        : item.status === "REJECTED"
          ? "text-muted"
          : "text-warn";

  return (
    <li
      className={`px-4 py-3 transition-opacity ${pending ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">
            {label}
            {isReq && deptName && (
              <span className="ml-2 rounded-full bg-mist px-2 py-0.5 text-xs text-ink">
                {deptName}
              </span>
            )}
          </p>
          {item.is_missing && item.status !== "EDITED" ? (
            <p className="mt-0.5">
              <span className="rounded bg-mist px-1.5 py-0.5 text-xs font-medium text-warn">
                {s.tbc}
              </span>
              {item.question && (
                <span className="ml-2 text-sm text-muted">{item.question}</span>
              )}
            </p>
          ) : (
            <p
              className={`mt-0.5 break-words font-medium ${item.status === "REJECTED" ? "text-muted line-through" : ""}`}
            >
              {shown}
              {item.unit && (
                <span className="ml-1 font-normal text-muted">{item.unit}</span>
              )}
            </p>
          )}
          {item.status === "EDITED" && item.value && !item.is_missing && (
            <p className="text-xs text-muted">
              {s.aiValue}: {item.value}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {item.status === "PENDING" && !item.is_missing && item.value && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => act("ACCEPT")}
                className={`${btn} border-brand text-brand`}
              >
                <Check className="size-3.5" aria-hidden /> {s.accept}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditing(true)}
                className={btn}
              >
                <Pencil className="size-3.5" aria-hidden /> {s.edit}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => act("REJECT")}
                className={btn}
              >
                <X className="size-3.5" aria-hidden /> {s.reject}
              </button>
            </>
          )}
          {item.is_missing && item.status === "PENDING" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setEditing(true)}
              className={btn}
            >
              <Pencil className="size-3.5" aria-hidden /> {s.fillManually}
            </button>
          )}
          {item.status !== "PENDING" && (
            <>
              <span className={`text-xs font-medium ${statusTone}`}>
                {s.itemStatus[item.status]}
              </span>
              {item.status !== "REJECTED" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setEditing(true)}
                  className={btn}
                >
                  <Pencil className="size-3.5" aria-hidden /> {s.edit}
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => act("RESET")}
                className={btn}
              >
                <RotateCcw className="size-3.5" aria-hidden /> {s.reset}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        {item.status === "PENDING" && !item.is_missing && (
          <span className="text-xs font-medium text-warn">
            {s.itemStatus.PENDING}
          </span>
        )}
        <Confidence value={item.confidence} thresholdPct={thresholdPct} />
      </div>

      {item.source_text && (
        <blockquote className="mt-2 border-l-2 border-rule pl-3 text-sm italic text-muted">
          “{item.source_text}”
          {item.source_verified === false && (
            <span className="mt-1 flex items-center gap-1 text-xs not-italic text-warn">
              <AlertTriangle className="size-3.5" aria-hidden />{" "}
              {s.sourceUnverified}
            </span>
          )}
        </blockquote>
      )}
      {!item.source_text && item.source_verified === false && (
        <p className="mt-2 flex items-center gap-1 text-xs text-warn">
          <AlertTriangle className="size-3.5" aria-hidden />{" "}
          {s.sourceUnverified}
        </p>
      )}

      {editing && (
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_200px_auto] md:items-end">
          <label className="text-sm">
            <span className="mb-1 block text-muted">{s.valuePlaceholder}</span>
            <input
              value={val}
              onChange={(e) => setVal(e.target.value)}
              className={field}
              autoFocus
            />
          </label>
          {isReq && (
            <label className="text-sm">
              <span className="mb-1 block text-muted">{s.department}</span>
              <select
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                className={field}
              >
                <option value="">{s.noDepartment}</option>
                {departments.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={pending || !val.trim()}
              onClick={() => act("EDIT", val, isReq ? dept : undefined)}
              className={btnPrimary}
            >
              {pending && (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              )}{" "}
              {s.save}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={btn}
            >
              {s.cancel}
            </button>
          </div>
        </div>
      )}
      {err && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {err}
        </p>
      )}
    </li>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
        {children}
      </ul>
    </div>
  );
}

export function AiReview(p: Props) {
  const { aiStatus, extraction, items, s } = { ...p, s: p.strings };
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null,
  );
  const [draft, setDraft] = useState(p.clarification);
  const [copied, setCopied] = useState(false);

  const run = (fn: () => Promise<Res | void>, onOk?: (r: Res) => string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (r && r.error)
        setMsg({ tone: "err", text: p.errors[r.error] ?? p.errors.UNKNOWN });
      else if (r && onOk) setMsg({ tone: "ok", text: onOk(r) });
    });

  const fields = items.filter((i) => i.kind === "FIELD" && !i.is_missing);
  const missing = items.filter((i) => i.kind === "FIELD" && i.is_missing);
  const reqs = items.filter((i) => i.kind === "REQUIREMENT");
  const rowProps = {
    s,
    errors: p.errors,
    departments: p.departments,
    thresholdPct: p.thresholdPct,
    review: p.reviewAction,
  };
  const nonInquiry = extraction && extraction.classification !== "INQUIRY";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard tidak tersedia: teks tetap bisa dipilih manual */
    }
  };

  const statusLabel = {
    NONE: s.statusNone,
    PENDING: s.statusPending,
    READY: s.statusReady,
    FAILED: s.statusFailed,
  }[aiStatus];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-brand" aria-hidden />
          <h2 className="text-lg font-semibold">{s.title}</h2>
          <span
            className={`text-sm ${aiStatus === "FAILED" ? "text-danger" : aiStatus === "READY" ? "text-ok" : "text-muted"}`}
          >
            {statusLabel}
          </span>
          {aiStatus === "PENDING" && (
            <Loader2 className="size-4 animate-spin text-muted" aria-hidden />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {aiStatus === "READY" && extraction && (
            <button
              type="button"
              disabled={pending}
              title={p.acceptHint}
              onClick={() =>
                run(
                  () => p.acceptConfidentAction(extraction.id),
                  (r) =>
                    r.count
                      ? p.acceptedCountTemplate.some.replace(
                          "{n}",
                          String(r.count),
                        )
                      : p.acceptedCountTemplate.none,
                )
              }
              className={btnPrimary}
            >
              <Check className="size-4" aria-hidden /> {s.acceptConfident}
            </button>
          )}
          {(aiStatus === "READY" || aiStatus === "FAILED") && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (aiStatus === "READY" && !window.confirm(s.reanalyzeConfirm))
                  return;
                run(p.reanalyzeAction);
              }}
              className={btn}
            >
              <RefreshCw className="size-3.5" aria-hidden />{" "}
              {aiStatus === "FAILED" ? s.retry : s.reanalyze}
            </button>
          )}
          {aiStatus === "NONE" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(p.reanalyzeAction)}
              className={btnPrimary}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-4" aria-hidden />
              )}{" "}
              {s.analyze}
            </button>
          )}
        </div>
      </div>

      {p.notice && (
        <p className="flex items-start gap-2 rounded-md border-l-4 border-warn bg-paper px-4 py-2.5 text-sm">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-warn"
            aria-hidden
          />{" "}
          {p.notice}
        </p>
      )}

      {aiStatus === "PENDING" && <PollWhilePending />}
      {msg && (
        <p
          role={msg.tone === "err" ? "alert" : "status"}
          className={`text-sm ${msg.tone === "err" ? "text-danger" : "text-ok"}`}
        >
          {msg.text}
        </p>
      )}

      {aiStatus === "FAILED" && (
        <p
          role="alert"
          className="rounded-md border-l-4 border-danger bg-paper px-4 py-3 text-sm"
        >
          <span className="text-muted">{s.failedHelp}</span>{" "}
          <span className="text-danger">{p.aiError}</span>
        </p>
      )}

      {aiStatus === "READY" && extraction && (
        <>
          <div className="rounded-xl border border-rule bg-paper px-4 py-3">
            <p className="max-w-prose">{extraction.summary}</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span>
                {s.classification}:{" "}
                <span className="text-ink">
                  {s.classes[extraction.classification] ??
                    extraction.classification}
                </span>
              </span>
              <span className="inline-flex items-center gap-2">
                {s.confidence}:{" "}
                <Confidence
                  value={extraction.overall_confidence}
                  thresholdPct={p.thresholdPct}
                />
              </span>
              {p.analyzedAt && <span>{p.analyzedAt}</span>}
              <span className="text-xs">
                {s.model}: {extraction.model} · {s.promptVersion}:{" "}
                {extraction.prompt_version}
              </span>
            </p>
          </div>

          {nonInquiry && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border-l-4 border-warn bg-paper px-4 py-3 text-sm"
            >
              <span>{s.notInquiry}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(s.dismissConfirm)) run(p.dismissAction);
                }}
                className={btn}
              >
                <Ban className="size-3.5" aria-hidden /> {s.dismiss}
              </button>
            </div>
          )}

          {p.attachmentsNote && (
            <p className="text-sm text-muted">{p.attachmentsNote}</p>
          )}

          {fields.length > 0 && (
            <Section title={s.fieldsTitle}>
              {fields.map((i) => (
                <ItemRow key={i.id} item={i} {...rowProps} />
              ))}
            </Section>
          )}
          {reqs.length > 0 && (
            <Section title={s.requirementsTitle}>
              {reqs.map((i) => (
                <ItemRow key={i.id} item={i} {...rowProps} />
              ))}
            </Section>
          )}
          {missing.length > 0 && (
            <Section title={s.missingTitle}>
              {missing.map((i) => (
                <ItemRow key={i.id} item={i} {...rowProps} />
              ))}
            </Section>
          )}
          {!fields.length && !reqs.length && !missing.length && (
            <p className="text-muted">{s.noItems}</p>
          )}

          {p.clarification && (
            <div>
              <h3 className="text-sm font-semibold">{s.clarifyTitle}</h3>
              <p className="mb-2 text-sm text-muted">{s.clarifyHelp}</p>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={9}
                className={`${field} font-sans leading-relaxed`}
              />
              <button type="button" onClick={copy} className={`${btn} mt-2`}>
                {copied ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <Copy className="size-3.5" aria-hidden />
                )}{" "}
                {copied ? s.copied : s.copy}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
