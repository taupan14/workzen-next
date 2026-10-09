import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronDown, Download, Paperclip } from "lucide-react";
import { serverClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { TASK_TONE, fmtDate } from "@/lib/format";
import { confidenceThreshold, showFreeTierNotice } from "@/lib/ai/config";
import { allowedTransitions, isStaff, needsFor } from "@/lib/tasks/transitions";
import { Status } from "@/components/status";
import {
  changeStatusAction,
  reparseAction,
  resolveReviewAction,
  reviewCostItemAction,
} from "./actions";
import { ReplyReview, type CostItem, type Parse } from "./reply-review";
import { TaskActions, type ActionDef } from "./task-actions";

export default async function TaskDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { lang, t } = await getI18n();
  const supabase = await serverClient();

  const { data: me } = await supabase.auth.getUser();
  const { data: profile } = me.user
    ? await supabase
        .from("profiles")
        .select("role")
        .eq("id", me.user.id)
        .maybeSingle()
    : { data: null };
  const role = profile?.role ?? null;

  const { data: task } = await supabase
    .from("tasks_with_flags")
    .select("*,departments(name),inquiries(id,inquiry_no,subject)")
    .eq("id", id)
    .maybeSingle();
  if (!task) notFound();

  const [emailsRes, parsesRes, itemsRes, eventsRes] = await Promise.all([
    supabase
      .from("email_messages")
      .select("id,direction,from_email,body_text,received_at")
      .eq("task_id", id)
      .order("received_at"),
    supabase
      .from("task_reply_parses")
      .select("*")
      .eq("task_id", id)
      .order("created_at"),
    supabase
      .from("task_cost_items")
      .select("*")
      .eq("task_id", id)
      .order("sort_order"),
    supabase
      .from("workflow_events")
      .select("id,event_type,created_at")
      .eq("entity_type", "task")
      .eq("entity_id", id)
      .order("id", { ascending: false })
      .limit(30),
  ]);
  const emails = emailsRes.data ?? [];
  const attachments = emails.length
    ? ((
        await supabase
          .from("attachments")
          .select("id,email_message_id,filename,size_bytes,process_status")
          .in(
            "email_message_id",
            emails.map((e) => e.id),
          )
      ).data ?? [])
    : [];

  const k = t.task;
  const staff = isStaff(role);
  const inq = task.inquiries as {
    id: string;
    inquiry_no: string;
    subject: string;
  };

  // ---- tindakan yang tersedia (mencerminkan aturan di database) ----
  const actions: ActionDef[] = allowedTransitions(role, task.status).map(
    (to) => {
      const revise = task.status === "SUBMITTED" && to === "IN_PROGRESS";
      const resume = task.status === "BLOCKED" && to === "IN_PROGRESS";
      const label = k.actions[revise ? "REVISE" : resume ? "RESUME" : to] ?? to;
      return {
        to,
        label,
        needs: needsFor(task.status, to),
        tone:
          to === "CANCELLED"
            ? "danger"
            : to === "VERIFIED" || to === "SUBMITTED"
              ? "primary"
              : "neutral",
      };
    },
  );

  // ---- hasil parsing balasan ----
  const items = (itemsRes.data ?? []) as (CostItem & { parse_id: string })[];
  const rawParses = parsesRes.data ?? [];
  const parses: Parse[] = rawParses.map((p: any) => ({
    id: p.id,
    intent: p.intent,
    intent_confidence:
      p.intent_confidence === null ? null : Number(p.intent_confidence),
    summary: p.summary,
    blocker: p.blocker,
    questions: p.questions ?? [],
    ambiguities: p.ambiguities ?? [],
    needs_review: p.needs_review,
    review_resolved: p.review_resolved,
    applied_status: p.applied_status,
    createdLabel: fmtDate(p.created_at, lang),
    appliedLabel: p.applied_status
      ? (t.status.task[p.applied_status] ?? p.applied_status)
      : null,
    items: items
      .filter((i) => i.parse_id === p.id)
      .map((i) => ({
        ...i,
        quantity: i.quantity === null ? null : Number(i.quantity),
        rate: i.rate === null ? null : Number(i.rate),
      })),
  }));

  const { replyN: _r, applied: _a, ...replyStrings } = k.reply;
  void _r;
  void _a;
  const evidence = (task.evidence ?? []) as {
    type: string;
    text: string;
    at: string;
  }[];

  return (
    <div className="space-y-10">
      <header>
        <Link
          href="/tasks"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden /> {k.back}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {inq.inquiry_no} · {task.task_no}
        </h1>
        <p className="mt-1 text-muted">{inq.subject}</p>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Status
            label={t.status.task[task.status] ?? task.status}
            tone={TASK_TONE[task.status] ?? "muted"}
          />
          <span className="text-muted">
            {k.department}:{" "}
            <span className="text-ink">{task.departments?.name}</span>
          </span>
          <span
            className={
              task.is_overdue ? "font-medium text-danger" : "text-muted"
            }
          >
            {k.deadline}:{" "}
            {task.deadline ? fmtDate(task.deadline, lang) : k.notSet}
            {task.is_overdue
              ? ` · ${t.tasks.flags.overdue}`
              : task.is_due_soon
                ? ` · ${t.tasks.flags.dueSoon}`
                : ""}
          </span>
          {task.status === "ASSIGNED" && task.sla_ack_due_at && (
            <span
              className={
                task.is_ack_overdue ? "font-medium text-warn" : "text-muted"
              }
            >
              {k.ackBy(fmtDate(task.sla_ack_due_at, lang))}
            </span>
          )}
          {task.acknowledged_at && task.status !== "ASSIGNED" && (
            <span className="text-muted">
              {k.ackedAt(fmtDate(task.acknowledged_at, lang))}
            </span>
          )}
          {task.submitted_at && (
            <span className="text-muted">
              {k.submittedAt(fmtDate(task.submitted_at, lang))}
            </span>
          )}
          {task.verified_at && (
            <span className="text-muted">
              {k.verifiedAt(fmtDate(task.verified_at, lang))}
            </span>
          )}
          {staff && (
            <Link
              href={`/inquiries/${inq.id}`}
              className="text-brand hover:underline"
            >
              {k.inquiry}: {inq.inquiry_no}
            </Link>
          )}
        </p>
        {task.status === "BLOCKED" && task.blocker && (
          <p
            role="alert"
            className="mt-3 rounded-md border-l-4 border-danger bg-paper px-4 py-2.5 text-sm"
          >
            <span className="text-muted">{k.blocker}:</span>{" "}
            <span className="text-danger">{task.blocker}</span>
          </p>
        )}
      </header>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{k.actionsTitle}</h2>
        {actions.length ? (
          <TaskActions
            actions={actions}
            strings={{
              blockerLabel: k.blockerLabel,
              blockerPh: k.blockerPh,
              noteRequired: k.noteRequired,
              noteOptional: k.noteOptional,
              confirm: k.confirm,
              cancelForm: k.cancelForm,
              saving: k.saving,
              confirmCancel: k.confirmCancel,
            }}
            errors={t.errors}
            change={changeStatusAction.bind(null, id)}
          />
        ) : (
          <p className="text-muted">{k.noActions}</p>
        )}
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted">{k.scope}</h2>
          <p className="whitespace-pre-wrap">{task.scope}</p>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted">
            {k.requiredOutput}
          </h2>
          <p className="whitespace-pre-wrap">
            {task.required_output ?? k.notSet}
          </p>
        </div>
      </section>

      <section>
        <ReplyReview
          parseStatus={
            task.reply_parse_status as "NONE" | "PENDING" | "READY" | "FAILED"
          }
          parses={parses}
          canReview={staff}
          thresholdPct={Math.round(confidenceThreshold() * 100)}
          strings={replyStrings}
          errors={t.errors}
          reviewAction={reviewCostItemAction.bind(null, id)}
          resolveAction={resolveReviewAction.bind(null, id)}
          reparseAction={reparseAction.bind(null, id)}
          // notice={showFreeTierNotice() ? t.ai.freeTierNotice : null}
          notice={null}
          labels={{
            replyN: parses.map((p, i) => k.reply.replyN(i + 1, p.createdLabel)),
            applied: parses.map((p) =>
              p.appliedLabel ? k.reply.applied(p.appliedLabel) : "",
            ),
          }}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{k.threadTitle}</h2>
        {emails.length ? (
          <ol className="space-y-3">
            {emails.map((m, idx) => {
              const atts = attachments.filter(
                (a) => a.email_message_id === m.id,
              );
              return (
                <li key={m.id}>
                  <details
                    open={idx === emails.length - 1}
                    className="group overflow-hidden rounded-xl border border-rule bg-paper"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-mist">
                      <span className="min-w-0 truncate">
                        <span className="text-muted">
                          {m.direction === "OUTBOUND"
                            ? k.sentTo
                            : k.receivedFrom}
                        </span>{" "}
                        <span className="font-medium">{m.from_email}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-muted">
                        {fmtDate(m.received_at, lang)}
                        <ChevronDown
                          className="size-4 transition-transform group-open:rotate-180"
                          aria-hidden
                        />
                      </span>
                    </summary>
                    <pre className="max-w-prose whitespace-pre-wrap border-t border-rule px-4 py-3 font-sans text-sm leading-relaxed">
                      {(m.body_text ?? "").slice(0, 4000)}
                    </pre>
                    {atts.length > 0 && (
                      <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t border-rule px-4 py-2 text-sm">
                        {atts.map((a) => (
                          <li
                            key={a.id}
                            className="inline-flex items-center gap-1.5"
                          >
                            <Paperclip
                              className="size-3.5 text-muted"
                              aria-hidden
                            />
                            {a.filename} (
                            {Math.round((a.size_bytes ?? 0) / 1024)} KB)
                            <span
                              className={`text-xs ${a.process_status === "DONE" ? "text-ok" : "text-warn"}`}
                            >
                              ·{" "}
                              {k.attachmentStatus[a.process_status] ??
                                a.process_status}
                            </span>
                            <a
                              href={`/api/attachments/${a.id}`}
                              className="inline-flex items-center gap-1 text-brand hover:underline"
                              aria-label={`${k.download} ${a.filename}`}
                            >
                              <Download className="size-3.5" aria-hidden />
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-muted">{k.noEmails}</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{k.evidenceTitle}</h2>
        {evidence.length ? (
          <ul className="space-y-2">
            {evidence.map((e, i) => (
              <li
                key={i}
                className="rounded-md border border-rule bg-paper px-4 py-2.5 text-sm"
              >
                <span className="text-muted">
                  {k.evidenceTypes[e.type] ?? e.type} · {fmtDate(e.at, lang)}
                </span>
                <p className="mt-0.5 whitespace-pre-wrap">{e.text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{k.noEvidence}</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{k.activityTitle}</h2>
        <ol className="ml-1 space-y-2 border-l-2 border-rule">
          {(eventsRes.data ?? []).map((e) => (
            <li key={e.id} className="pl-4 text-sm">
              {t.status.events[e.event_type] ?? e.event_type}
              <span className="text-muted">
                {" "}
                · {fmtDate(e.created_at, lang)}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
