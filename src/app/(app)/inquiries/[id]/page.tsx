import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  Download,
  FileText,
  Paperclip,
} from "lucide-react";
import { serverClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { INQUIRY_TONE, TASK_TONE, fmtDate } from "@/lib/format";
import { suggestDepartments } from "@/lib/routing";
import { confidenceThreshold, showFreeTierNotice } from "@/lib/ai/config";
import { clarificationDraft } from "@/lib/ai/clarification";
import { Status } from "@/components/status";
import { Rp, StatusBadge } from "@/components/documents/ui";
import { p4EventLabel, p4Labels } from "@/lib/documents/labels";
import { createTasksAction } from "./actions";
import {
  acceptConfidentAction,
  dismissInquiryAction,
  reanalyzeAction,
  reviewItemAction,
} from "./ai-actions";
import { AiReview, type AiItem } from "./ai-review";
import { TaskForm } from "./task-form";

export default async function InquiryDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { lang, t } = await getI18n();
  const supabase = await serverClient();

  // Costing & dokumen hanya untuk staf (RLS juga membatasi; ini agar tautan tidak tampil sia-sia).
  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = auth.user
    ? await supabase
        .from("profiles")
        .select("role")
        .eq("id", auth.user.id)
        .maybeSingle()
    : { data: null };
  const isStaff = ["admin", "coo", "sales_lead", "sales"].includes(
    me?.role ?? "",
  );
  const p4 = p4Labels(lang);

  const { data: inquiry } = await supabase
    .from("inquiries")
    .select(
      "id,inquiry_no,subject,status,from_email,from_name,body_text,received_at,ai_status,ai_error,customers(name,email)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!inquiry) notFound();

  const [
    emails,
    attachments,
    tasks,
    events,
    depts,
    rules,
    extractionRes,
    docsRes,
  ] = await Promise.all([
    supabase
      .from("email_messages")
      .select("id,direction,from_email,subject,body_text,received_at")
      .eq("inquiry_id", id)
      .order("received_at"),
    supabase
      .from("attachments")
      .select("id,filename,size_bytes,process_status")
      .eq("inquiry_id", id),
    supabase
      .from("tasks_with_flags")
      .select("id,task_no,scope,deadline,status,is_overdue,departments(name)")
      .eq("inquiry_id", id)
      .order("created_at"),
    supabase
      .from("workflow_events")
      .select("id,event_type,created_at")
      .eq("inquiry_id", id)
      .order("id", { ascending: false })
      .limit(30),
    supabase
      .from("departments")
      .select("id,code,name,email")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("routing_rules")
      .select("department_id,keywords,priority")
      .eq("is_active", true),
    supabase
      .from("ai_extractions")
      .select(
        "id,summary,classification,overall_confidence,language,prompt_version,model,created_at,routing",
      )
      .eq("inquiry_id", id)
      .eq("is_current", true)
      .maybeSingle(),
    // Phase 4. Tabel belum ada (migrasi belum jalan) atau bukan staf -> kosong, tanpa error halaman.
    supabase
      .from("documents")
      .select("id,doc_no,doc_type,version,revision,status,total_idr")
      .eq("inquiry_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const extraction = extractionRes.data;
  const docs = isStaff && !docsRes.error ? (docsRes.data ?? []) : [];
  const items: AiItem[] = extraction
    ? (((
        await supabase
          .from("ai_extraction_items")
          .select("*")
          .eq("extraction_id", extraction.id)
          .order("sort_order")
      ).data ?? []) as AiItem[])
    : [];

  const d = t.detail;
  const closed = ["CLOSED", "CANCELLED"].includes(inquiry.status);
  const cust = inquiry.customers as any;
  const emailList = emails.data ?? [];
  const departments = depts.data ?? [];
  const taskedCodes = new Set(
    (tasks.data ?? []).map((x: any) => String(x.task_no).split("-")[0]),
  );

  // ---- saran departemen: aturan keyword + saran AI + requirement yang sudah diterima ----
  const ruleIds = suggestDepartments(
    `${inquiry.subject}\n${inquiry.body_text ?? ""}`,
    rules.data ?? [],
  );
  const aiReasons = new Map<string, string>();
  for (const r of (extraction?.routing as any[]) ?? [])
    aiReasons.set(
      String(r.department_code).toUpperCase(),
      String(r.reason ?? ""),
    );
  const scopeByCode = new Map<string, string[]>();
  for (const it of items) {
    if (
      it.kind !== "REQUIREMENT" ||
      (it.status !== "ACCEPTED" && it.status !== "EDITED")
    )
      continue;
    const code = it.final_department ?? it.department_code;
    if (!code) continue;
    const text = `• ${it.label}${it.final_value ? `: ${it.final_value}` : ""}`;
    scopeByCode.set(code, [...(scopeByCode.get(code) ?? []), text]);
    if (!aiReasons.has(code)) aiReasons.set(code, "");
  }
  const taskDepartments = departments.map((x) => ({
    id: x.id,
    name: x.name,
    email: x.email,
    already: taskedCodes.has(x.code),
    badges: [
      ...(aiReasons.has(x.code) ? ["ai" as const] : []),
      ...(ruleIds.has(x.id) ? ["rule" as const] : []),
    ],
    reason: aiReasons.get(x.code) || undefined,
    defaultScope: scopeByCode.get(x.code)?.join("\n"),
  }));
  const formKey = taskDepartments
    .map((x) => `${x.id}:${x.badges.join("")}:${x.defaultScope ?? ""}`)
    .join("|");

  // ---- draft klarifikasi dari pertanyaan AI yang belum terjawab ----
  const questions = items
    .filter((i) => i.is_missing && i.status !== "EDITED" && i.question)
    .map((i) => i.question as string);
  const clarification = clarificationDraft({
    lang:
      extraction?.language === "en"
        ? "en"
        : extraction?.language === "id"
          ? "id"
          : lang,
    name: cust?.name ?? inquiry.from_name ?? null,
    subject: inquiry.subject,
    questions,
  });

  const unreadable = (attachments.data ?? []).filter(
    (a) => a.process_status !== "DONE",
  ).length;
  const {
    attachmentsNote,
    acceptConfidentHint,
    analyzedAt,
    acceptedCount,
    ...aiStrings
  } = t.ai;
  const thresholdPct = Math.round(confidenceThreshold() * 100);

  return (
    <div className="space-y-10">
      <header>
        <Link
          href="/inquiries"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden /> {t.common.back}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {inquiry.subject}
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span>{inquiry.inquiry_no}</span>
          <span>
            {cust?.name ?? inquiry.from_name} ({inquiry.from_email})
          </span>
          <span>{d.received(fmtDate(inquiry.received_at, lang))}</span>
          <span className="text-ink">
            <Status
              label={t.status.inquiry[inquiry.status] ?? inquiry.status}
              tone={INQUIRY_TONE[inquiry.status] ?? "muted"}
            />
          </span>
        </p>
        {isStaff && (
          <Link
            href={`/inquiries/${id}/costing`}
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-rule bg-field px-3 py-1.5 text-sm font-medium transition-colors hover:border-brand"
          >
            <FileText className="size-4" aria-hidden /> {p4.costingLink}
          </Link>
        )}
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-md border-l-4 border-danger bg-paper px-4 py-3 text-sm text-danger"
        >
          {t.errors[error] ?? t.errors.UNKNOWN}
        </p>
      )}

      <section>
        <AiReview
          aiStatus={
            inquiry.ai_status as "NONE" | "PENDING" | "READY" | "FAILED"
          }
          aiError={inquiry.ai_error}
          extraction={extraction}
          items={items}
          departments={departments.map((x) => ({ code: x.code, name: x.name }))}
          thresholdPct={thresholdPct}
          strings={aiStrings}
          errors={t.errors}
          attachmentsNote={unreadable > 0 ? attachmentsNote(unreadable) : null}
          acceptHint={acceptConfidentHint(thresholdPct)}
          analyzedAt={
            extraction ? analyzedAt(fmtDate(extraction.created_at, lang)) : null
          }
          clarification={clarification}
          // notice={showFreeTierNotice() ? t.ai.freeTierNotice : null}
          notice={null}
          acceptedCountTemplate={{
            some: acceptedCount(2).replace("2", "{n}"),
            none: acceptedCount(0),
          }}
          reviewAction={reviewItemAction.bind(null, id)}
          acceptConfidentAction={acceptConfidentAction.bind(null, id)}
          reanalyzeAction={reanalyzeAction.bind(null, id)}
          dismissAction={dismissInquiryAction.bind(null, id)}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{d.tasksTitle}</h2>
        {tasks.data?.length ? (
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
            {tasks.data.map((x: any) => (
              <li
                key={x.id}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="font-medium">
                    {x.task_no} · {x.departments?.name}
                  </span>
                  <span className="block max-w-xl truncate text-sm text-muted">
                    {x.scope}
                  </span>
                </span>
                <span className="text-right text-sm">
                  <Status
                    label={t.status.task[x.status] ?? x.status}
                    tone={TASK_TONE[x.status] ?? "muted"}
                  />
                  {x.deadline && (
                    <span
                      className={`block ${x.is_overdue ? "font-medium text-danger" : "text-muted"}`}
                    >
                      {(x.is_overdue ? d.overdueOn : d.deadlineOn)(
                        fmtDate(x.deadline, lang, false),
                      )}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{d.tasksEmpty}</p>
        )}
      </section>

      {isStaff && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">{p4.documentsTitle}</h2>
          {docs.length ? (
            <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
              {docs.map((x: any) => (
                <li key={x.id}>
                  <Link
                    href={`/documents/${x.id}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 transition-colors hover:bg-mist"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{x.doc_no}</span>
                      <span className="block text-sm text-muted">
                        {x.doc_type} · v{x.version}
                        {x.revision > 0 ? ` · rev ${x.revision}` : ""}
                      </span>
                    </span>
                    <span className="text-right text-sm">
                      <StatusBadge status={x.status} />
                      <span className="block text-muted">
                        <Rp v={x.total_idr} />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">{p4.documentsEmpty}</p>
          )}
        </section>
      )}

      {!closed && (
        <section>
          <h2 className="text-lg font-semibold">{d.validateTitle}</h2>
          <p className="mb-4 mt-1 max-w-2xl text-sm text-muted">
            {d.validateHelp}
          </p>
          <TaskForm
            key={formKey}
            action={createTasksAction.bind(null, id)}
            departments={taskDepartments}
            labels={{
              suggestedAi: t.ai.suggestedAi,
              suggestedRule: t.ai.suggestedRule,
              already: d.already,
              noEmail: d.noEmail,
              scope: d.scope,
              scopePh: d.scopePh,
              output: d.output,
              deadline: d.deadline,
              submit: d.submit,
              submitting: d.submitting,
              selected: d.selected,
            }}
          />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">{d.threadTitle}</h2>
        <ol className="space-y-3">
          {emailList.map((m, idx) => (
            <li key={m.id}>
              <details
                open={idx === emailList.length - 1 || idx === 0}
                className="group overflow-hidden rounded-xl border border-rule bg-paper"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-mist">
                  <span className="min-w-0 truncate">
                    <span className="text-muted">
                      {m.direction === "OUTBOUND" ? d.sentTo : d.receivedFrom}
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
              </details>
            </li>
          ))}
        </ol>
        {!!attachments.data?.length && (
          <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <li className="inline-flex items-center gap-1 text-muted">
              <Paperclip className="size-4" aria-hidden /> {d.attachments}
            </li>
            {attachments.data.map((a) => (
              <li key={a.id} className="inline-flex items-center gap-1.5">
                {a.filename} ({Math.round((a.size_bytes ?? 0) / 1024)} KB)
                <span
                  className={`text-xs ${a.process_status === "DONE" ? "text-ok" : "text-warn"}`}
                >
                  ·{" "}
                  {t.task.attachmentStatus[a.process_status] ??
                    a.process_status}
                </span>
                <a
                  href={`/api/attachments/${a.id}`}
                  className="text-brand hover:underline"
                  aria-label={`${t.task.download} ${a.filename}`}
                >
                  <Download className="size-3.5" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{d.activityTitle}</h2>
        <ol className="ml-1 space-y-2 border-l-2 border-rule">
          {(events.data ?? []).map((e) => (
            <li key={e.id} className="pl-4 text-sm">
              {t.status.events[e.event_type] ??
                p4EventLabel(lang, e.event_type) ??
                e.event_type}
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
