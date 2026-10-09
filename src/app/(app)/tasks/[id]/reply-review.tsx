"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { PollWhilePending } from "@/components/pool-while-pending";

export type CostItem = {
  id: string;
  parse_id: string;
  vendor: string | null;
  item: string | null;
  quantity: number | null;
  uom: string | null;
  rate: number | null;
  currency: string | null;
  validity: string | null;
  availability: string | null;
  notes: string | null;
  confidence: number | null;
  source_text: string | null;
  source_verified: boolean | null;
  validation_status: "VALID" | "NEEDS_REVIEW" | "INVALID";
  issues: string[];
  status: "PENDING" | "ACCEPTED" | "EDITED" | "REJECTED";
};
export type Parse = {
  id: string;
  intent: string;
  intent_confidence: number | null;
  summary: string | null;
  blocker: string | null;
  questions: string[];
  ambiguities: string[];
  needs_review: boolean;
  review_resolved: boolean;
  applied_status: string | null;
  createdLabel: string;
  appliedLabel: string | null;
  items: CostItem[];
};
type Strings = {
  title: string;
  statusNone: string;
  statusPending: string;
  statusReady: string;
  statusFailed: string;
  failedHelp: string;
  parseAgain: string;
  markReviewed: string;
  reviewed: string;
  intent: string;
  confidence: string;
  summary: string;
  blocker: string;
  questions: string;
  ambiguities: string;
  intents: Record<string, string>;
  needsReview: string;
  autoOk: string;
  itemsTitle: string;
  noItems: string;
  fields: Record<string, string>;
  validation: Record<string, string>;
  issues: Record<string, string>;
  itemStatus: Record<string, string>;
  accept: string;
  edit: string;
  reject: string;
  reset: string;
  save: string;
  cancel: string;
  source: string;
  aiNote: string;
};
type Res = { error?: string };

const btn =
  "inline-flex items-center gap-1 rounded-md border border-rule bg-field px-2 py-1 text-xs transition-colors hover:border-brand disabled:opacity-50";
const field =
  "w-full rounded-md border border-rule bg-field px-2.5 py-1.5 text-sm focus-visible:border-brand";
const VAL_TONE = {
  VALID: "text-ok",
  NEEDS_REVIEW: "text-warn",
  INVALID: "text-danger",
} as const;

const money = (n: number | null, cur: string | null) =>
  n === null
    ? "—"
    : `${cur ?? ""} ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(n)}`.trim();

function Item(props: {
  it: CostItem;
  s: Strings;
  errors: Record<string, string>;
  canReview: boolean;
  thresholdPct: number;
  review: (
    id: string,
    a: "ACCEPT" | "EDIT" | "REJECT" | "RESET",
    f?: Record<string, string>,
  ) => Promise<Res>;
}) {
  const { it, s, errors, canReview } = props;
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<Record<string, string>>({
    vendor: it.vendor ?? "",
    item: it.item ?? "",
    quantity: it.quantity?.toString() ?? "",
    uom: it.uom ?? "",
    rate: it.rate?.toString() ?? "",
    currency: it.currency ?? "",
    validity: it.validity ?? "",
    availability: it.availability ?? "",
    notes: it.notes ?? "",
  });
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const act = (
    a: "ACCEPT" | "EDIT" | "REJECT" | "RESET",
    fields?: Record<string, string>,
  ) =>
    start(async () => {
      setErr(null);
      const r = await props.review(it.id, a, fields);
      if (r.error) setErr(errors[r.error] ?? errors.UNKNOWN);
      else setEditing(false);
    });

  return (
    <li
      className={`px-4 py-3 transition-opacity ${pending ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={`font-medium ${it.status === "REJECTED" ? "text-muted line-through" : ""}`}
          >
            {it.item ?? "—"}{" "}
            <span className="font-normal text-muted">· {it.vendor ?? "—"}</span>
          </p>
          <p className="mt-0.5 text-sm">
            {money(it.rate, it.currency)}
            {it.uom ? ` / ${it.uom}` : ""}
            {it.quantity !== null && (
              <span className="text-muted">
                {" "}
                · {s.fields.quantity}: {it.quantity}
                {it.uom ? ` ${it.uom}` : ""}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {s.fields.validity}: {it.validity ?? "—"}
            {it.availability ? ` · ${it.availability}` : ""}
            {it.notes ? ` · ${it.notes}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`text-xs font-medium ${VAL_TONE[it.validation_status]}`}
          >
            {s.validation[it.validation_status]}
          </span>
          <span className="text-xs text-muted">
            · {s.itemStatus[it.status]}
          </span>
          {canReview && (
            <>
              {it.status === "PENDING" &&
                it.validation_status !== "INVALID" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act("ACCEPT")}
                    className={`${btn} border-brand text-brand`}
                  >
                    <Check className="size-3.5" aria-hidden /> {s.accept}
                  </button>
                )}
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditing(true)}
                className={btn}
              >
                <Pencil className="size-3.5" aria-hidden /> {s.edit}
              </button>
              {it.status !== "REJECTED" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act("REJECT")}
                  className={btn}
                >
                  <X className="size-3.5" aria-hidden /> {s.reject}
                </button>
              )}
              {it.status !== "PENDING" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act("RESET")}
                  className={btn}
                  title={s.reset}
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {it.issues.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {it.issues.map((c) => (
            <li
              key={c}
              className="inline-flex items-center gap-1 rounded-full bg-mist px-2 py-0.5 text-xs text-warn"
            >
              <AlertTriangle className="size-3" aria-hidden />{" "}
              {s.issues[c] ?? c}
            </li>
          ))}
        </ul>
      )}
      {it.source_text && (
        <blockquote className="mt-2 border-l-2 border-rule pl-3 text-sm italic text-muted">
          “{it.source_text}”
        </blockquote>
      )}

      {editing && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              "vendor",
              "item",
              "quantity",
              "uom",
              "rate",
              "currency",
              "validity",
              "availability",
              "notes",
            ] as const
          ).map((k) => (
            <label
              key={k}
              className={`text-sm ${k === "notes" ? "sm:col-span-2 lg:col-span-2" : ""}`}
            >
              <span className="mb-1 block text-muted">{s.fields[k]}</span>
              <input
                type={k === "validity" ? "date" : "text"}
                inputMode={
                  k === "quantity" || k === "rate" ? "decimal" : undefined
                }
                value={f[k]}
                onChange={(e) => setF({ ...f, [k]: e.target.value })}
                className={field}
              />
            </label>
          ))}
          <div className="flex items-end gap-1.5 sm:col-span-2 lg:col-span-4">
            <button
              type="button"
              disabled={pending}
              onClick={() => act("EDIT", f)}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-on-brand hover:bg-brand-ink disabled:opacity-50"
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

export function ReplyReview(props: {
  parseStatus: "NONE" | "PENDING" | "READY" | "FAILED";
  parses: Parse[];
  canReview: boolean;
  thresholdPct: number;
  strings: Strings;
  errors: Record<string, string>;
  reviewAction: (
    id: string,
    a: "ACCEPT" | "EDIT" | "REJECT" | "RESET",
    f?: Record<string, string>,
  ) => Promise<Res>;
  resolveAction: (parseId: string) => Promise<Res>;
  reparseAction: () => Promise<Res>;
  labels: { replyN: string[]; applied: string[] };
  notice: string | null;
}) {
  const { parseStatus, parses, canReview, strings: s, errors } = props;
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<Res>) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if (r.error) setErr(errors[r.error] ?? errors.UNKNOWN);
    });

  const statusLabel = {
    NONE: s.statusNone,
    PENDING: s.statusPending,
    READY: s.statusReady,
    FAILED: s.statusFailed,
  }[parseStatus];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-brand" aria-hidden />
          <h2 className="text-lg font-semibold">{s.title}</h2>
          <span
            className={`text-sm ${parseStatus === "FAILED" ? "text-danger" : parseStatus === "READY" ? "text-ok" : "text-muted"}`}
          >
            {statusLabel}
          </span>
          {parseStatus === "PENDING" && (
            <Loader2 className="size-4 animate-spin text-muted" aria-hidden />
          )}
        </div>
        {canReview && parseStatus !== "NONE" && parseStatus !== "PENDING" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(props.reparseAction)}
            className={btn}
          >
            <RefreshCw className="size-3.5" aria-hidden /> {s.parseAgain}
          </button>
        )}
      </div>
      {props.notice && (
        <p className="flex items-start gap-2 rounded-md border-l-4 border-warn bg-paper px-4 py-2.5 text-sm">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-warn"
            aria-hidden
          />{" "}
          {props.notice}
        </p>
      )}
      {parseStatus === "PENDING" && <PollWhilePending />}
      {parseStatus === "FAILED" && (
        <p
          role="alert"
          className="rounded-md border-l-4 border-danger bg-paper px-4 py-3 text-sm text-danger"
        >
          {s.failedHelp}
        </p>
      )}
      {err && (
        <p role="alert" className="text-sm text-danger">
          {err}
        </p>
      )}
      {parses.length > 0 && <p className="text-xs text-muted">{s.aiNote}</p>}

      {parses.map((p, idx) => {
        const needs = p.needs_review && !p.review_resolved;
        return (
          <section
            key={p.id}
            className="space-y-3 rounded-xl border border-rule bg-paper p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {props.labels.replyN[idx]}
              </h3>
              <span
                className={`text-xs font-medium ${needs ? "text-warn" : "text-ok"}`}
              >
                {needs
                  ? s.needsReview
                  : p.review_resolved
                    ? s.reviewed
                    : s.autoOk}
              </span>
            </div>
            <p className="text-sm">
              <span className="text-muted">{s.intent}:</span>{" "}
              <span className="font-medium">
                {s.intents[p.intent] ?? p.intent}
              </span>
              {p.intent_confidence !== null && (
                <span className="text-muted">
                  {" "}
                  · {s.confidence} {Math.round(p.intent_confidence * 100)}%
                </span>
              )}
            </p>
            {p.summary && <p className="max-w-prose text-sm">{p.summary}</p>}
            {props.labels.applied[idx] && (
              <p className="text-sm text-brand">{props.labels.applied[idx]}</p>
            )}
            {p.blocker && (
              <p className="text-sm">
                <span className="text-muted">{s.blocker}:</span>{" "}
                <span className="text-danger">{p.blocker}</span>
              </p>
            )}
            {p.questions.length > 0 && (
              <div className="text-sm">
                <p className="text-muted">{s.questions}</p>
                <ul className="ml-5 list-disc">
                  {p.questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
            {p.ambiguities.length > 0 && (
              <div className="text-sm">
                <p className="text-warn">{s.ambiguities}</p>
                <ul className="ml-5 list-disc">
                  {p.ambiguities.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h4 className="mb-1.5 text-sm font-semibold">{s.itemsTitle}</h4>
              {p.items.length ? (
                <ul className="divide-y divide-rule overflow-hidden rounded-lg border border-rule bg-mist/40">
                  {p.items.map((it) => (
                    <Item
                      key={it.id}
                      it={it}
                      s={s}
                      errors={errors}
                      canReview={canReview}
                      thresholdPct={props.thresholdPct}
                      review={props.reviewAction}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">{s.noItems}</p>
              )}
            </div>

            {canReview && needs && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => props.resolveAction(p.id))}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-on-brand hover:bg-brand-ink disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Check className="size-4" aria-hidden />
                )}{" "}
                {s.markReviewed}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
