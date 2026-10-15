import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  FileText,
  Paperclip,
} from "lucide-react";
import { serverClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { INQUIRY_TONE, TASK_TONE, fmtDate } from "@/lib/format";
import { suggestDepartments } from "@/lib/routing";
import { confidenceThreshold } from "@/lib/ai/config";
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

type StepState = "done" | "current" | "todo";

// Teks khusus tampilan alur; dipisah di sini agar kamus i18n tidak perlu diubah.
const FLOW = {
  id: {
    steps: ["Intake", "Review AI", "Task", "Costing", "Dokumen"],
    flowLabel: "Progres inquiry",
    customer: "Customer",
    next: "Langkah berikutnya",
    summary: "Ringkasan",
    tasks: "Task",
    verified: "terverifikasi",
    documents: "Dokumen",
    activity: "Aktivitas",
    showAll: "Lihat semua",
    allDone: "Semua langkah sudah selesai.",
    aiPending: "AI sedang menganalisis email ini.",
    aiFailed: "Analisis AI gagal. Coba analisis ulang.",
    aiReview: "Tinjau hasil analisis AI",
    sendTasks: "Pilih departemen dan kirim task",
    trackTasks: "Pantau task departemen",
    costing: "Susun costing",
    makeDoc: "Buat dan kirim dokumen",
    follow: "Pantau dokumen",
  },
  en: {
    steps: ["Intake", "AI review", "Tasks", "Costing", "Documents"],
    flowLabel: "Inquiry progress",
    customer: "Customer",
    next: "Next step",
    summary: "Summary",
    tasks: "Tasks",
    verified: "verified",
    documents: "Documents",
    activity: "Activity",
    showAll: "Show all",
    allDone: "All steps are complete.",
    aiPending: "AI is analyzing this email.",
    aiFailed: "AI analysis failed. Try analyzing again.",
    aiReview: "Review the AI analysis",
    sendTasks: "Choose departments and send tasks",
    trackTasks: "Follow up on department tasks",
    costing: "Build the costing",
    makeDoc: "Create and send the document",
    follow: "Follow up on the document",
  },
} as const;

const STEP_STYLE: Record<StepState, string> = {
  done: "border-ok bg-paper text-ok",
  current: "border-brand bg-brand text-on-brand",
  todo: "border-rule bg-paper text-muted",
};

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
  const F = lang === "en" ? FLOW.en : FLOW.id;

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
    scenariosRes,
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
    // Phase 4. Tabel belum ada atau bukan staf -> kosong, tanpa error halaman.
    supabase
      .from("documents")
      .select("id,doc_no,doc_type,version,revision,status,total_idr")
      .eq("inquiry_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("cost_scenarios").select("id").eq("inquiry_id", id),
  ]);

  const extraction = extractionRes.data;
  const docs = isStaff && !docsRes.error ? (docsRes.data ?? []) : [];
  const scenarioCount =
    isStaff && !scenariosRes.error ? (scenariosRes.data?.length ?? 0) : 0;
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
  const taskList = (tasks.data ?? []) as any[];
  const departments = depts.data ?? [];
  const taskedCodes = new Set(
    taskList.map((x: any) => String(x.task_no).split("-")[0]),
  );

  // ---- posisi inquiry di alur kerja (hanya tampilan; tidak mengubah data) ----
  const activeTasks = taskList.filter((x) => x.status !== "CANCELLED");
  const verifiedTasks = activeTasks.filter((x) => x.status === "VERIFIED");
  const reviewDone =
    activeTasks.length > 0 ||
    ["VALIDATED", "IN_PROGRESS", "CLOSED"].includes(inquiry.status);
  const tasksDone =
    activeTasks.length > 0 && verifiedTasks.length === activeTasks.length;
  const costingDone = docs.length > 0;
  const docsDone = docs.some((x: any) => x.status === "SENT");
  const doneFlags = [true, reviewDone, tasksDone, costingDone, docsDone];
  const currentIdx = doneFlags.findIndex((v) => !v);
  const stepState = (i: number): StepState =>
    doneFlags[i] ? "done" : i === currentIdx ? "current" : "todo";
  // Stepper hanya untuk staf: akun departemen tidak punya langkah costing/dokumen.
  const steps = isStaff ? F.steps : F.steps.slice(0, 3);

  const costingHref = `/inquiries/${id}/costing`;
  const next = (() => {
    if (currentIdx === -1 || (!isStaff && currentIdx > 2))
      return { text: F.allDone, href: null as string | null };
    if (currentIdx === 1) {
      if (inquiry.ai_status === "PENDING")
        return { text: F.aiPending, href: "#ai-review" };
      if (inquiry.ai_status === "FAILED")
        return { text: F.aiFailed, href: "#ai-review" };
      return { text: F.aiReview, href: "#ai-review" };
    }
    if (currentIdx === 2)
      return {
        text: activeTasks.length ? F.trackTasks : F.sendTasks,
        href: activeTasks.length ? "#tasks" : "#send-tasks",
      };
    if (currentIdx === 3) return { text: F.costing, href: costingHref };
    return {
      text: docs.length ? F.follow : F.makeDoc,
      href: docs.length ? "#documents" : costingHref,
    };
  })();

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

  const eventLabel = (type: string) =>
    t.status.events[type] ?? p4EventLabel(lang, type) ?? type;
  const eventList = events.data ?? [];
  const recentEvents = eventList.slice(0, 6);
  const olderEvents = eventList.slice(6);

  const eventItem = (e: (typeof eventList)[number]) => (
    <li key={e.id} className="pl-4 text-sm">
      {eventLabel(e.event_type)}
      <span className="block text-xs text-muted">
        {fmtDate(e.created_at, lang)}
      </span>
    </li>
  );

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/inquiries"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden /> {t.common.back}
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight">
              {inquiry.subject}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span className="font-medium text-ink">{inquiry.inquiry_no}</span>
              <span>{d.received(fmtDate(inquiry.received_at, lang))}</span>
              <span className="text-ink">
                <Status
                  label={t.status.inquiry[inquiry.status] ?? inquiry.status}
                  tone={INQUIRY_TONE[inquiry.status] ?? "muted"}
                />
              </span>
            </p>
          </div>
          {isStaff && (
            <Link
              href={costingHref}
              className="inline-flex shrink-0 items-center gap-2 rounded-md border border-rule bg-field px-3 py-1.5 text-sm font-medium transition-colors hover:border-brand"
            >
              <FileText className="size-4" aria-hidden /> {p4.costingLink}
            </Link>
          )}
        </div>

        <nav aria-label={F.flowLabel} className="mt-6 overflow-x-auto">
          <ol className="flex min-w-max items-center gap-2">
            {steps.map((label, i) => {
              const s = stepState(i);
              return (
                <li
                  key={label}
                  className="flex items-center gap-2"
                  aria-current={s === "current" ? "step" : undefined}
                >
                  <span
                    className={`flex size-6 items-center justify-center rounded-full border text-xs font-medium ${STEP_STYLE[s]}`}
                  >
                    {s === "done" ? (
                      <Check className="size-3.5" aria-hidden />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span
                    className={`text-sm ${s === "current" ? "font-medium text-ink" : s === "done" ? "text-ink" : "text-muted"}`}
                  >
                    {label}
                  </span>
                  {i < steps.length - 1 && (
                    <span
                      aria-hidden
                      className={`mx-1 h-px w-8 sm:w-12 ${doneFlags[i] ? "bg-ok" : "bg-rule"}`}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-md border-l-4 border-danger bg-paper px-4 py-3 text-sm text-danger"
        >
          {t.errors[error] ?? t.errors.UNKNOWN}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ---------- kolom utama ---------- */}
        <div className="min-w-0 space-y-10">
          <section id="ai-review" className="scroll-mt-6">
            <AiReview
              aiStatus={
                inquiry.ai_status as "NONE" | "PENDING" | "READY" | "FAILED"
              }
              aiError={inquiry.ai_error}
              extraction={extraction}
              items={items}
              departments={departments.map((x) => ({
                code: x.code,
                name: x.name,
              }))}
              thresholdPct={thresholdPct}
              strings={aiStrings}
              errors={t.errors}
              attachmentsNote={
                unreadable > 0 ? attachmentsNote(unreadable) : null
              }
              acceptHint={acceptConfidentHint(thresholdPct)}
              analyzedAt={
                extraction
                  ? analyzedAt(fmtDate(extraction.created_at, lang))
                  : null
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

          <section id="tasks" className="scroll-mt-6">
            <h2 className="mb-3 text-lg font-semibold">{d.tasksTitle}</h2>
            {taskList.length ? (
              <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
                {taskList.map((x: any) => (
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

          {!closed && (
            <section id="send-tasks" className="scroll-mt-6">
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

          <section id="thread" className="scroll-mt-6">
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
                          {m.direction === "OUTBOUND"
                            ? d.sentTo
                            : d.receivedFrom}
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
        </div>

        {/* ---------- panel samping ---------- */}
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-xl border border-rule bg-paper p-4">
            <h2 className="text-sm font-medium text-muted">{F.customer}</h2>
            <p className="mt-1 font-medium">
              {cust?.name ?? inquiry.from_name ?? inquiry.from_email}
            </p>
            <p className="break-all text-sm text-muted">{inquiry.from_email}</p>
          </section>

          <section className="rounded-xl border border-brand bg-paper p-4">
            <h2 className="text-sm font-medium text-muted">{F.next}</h2>
            <p className="mt-1 font-medium">{next.text}</p>
            {next.href && (
              <Link
                href={next.href}
                className="mt-3 inline-flex items-center gap-2 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-on-brand transition hover:bg-brand-ink active:scale-[.98]"
              >
                {next.text} <ArrowRight className="size-4" aria-hidden />
              </Link>
            )}
          </section>

          <section className="rounded-xl border border-rule bg-paper p-4">
            <h2 className="text-sm font-medium text-muted">{F.summary}</h2>
            <dl className="mt-2 space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{F.tasks}</dt>
                <dd className="font-medium">
                  {verifiedTasks.length}/{activeTasks.length} {F.verified}
                </dd>
              </div>
              {isStaff && (
                <>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Costing</dt>
                    <dd className="font-medium">{scenarioCount}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">{F.documents}</dt>
                    <dd className="font-medium">{docs.length}</dd>
                  </div>
                </>
              )}
            </dl>
          </section>

          {isStaff && (
            <section
              id="documents"
              className="scroll-mt-6 rounded-xl border border-rule bg-paper"
            >
              <h2 className="px-4 pt-4 text-sm font-medium text-muted">
                {p4.documentsTitle}
              </h2>
              {docs.length ? (
                <ul className="mt-2 divide-y divide-rule border-t border-rule">
                  {docs.map((x: any) => (
                    <li key={x.id}>
                      <Link
                        href={`/documents/${x.id}`}
                        className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm transition-colors hover:bg-mist"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {x.doc_no}
                          </span>
                          <span className="block text-muted">
                            {x.doc_type} · v{x.version}
                            {x.revision > 0 ? ` · rev ${x.revision}` : ""}
                          </span>
                        </span>
                        <span className="text-right">
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
                <p className="px-4 pb-4 pt-1 text-sm text-muted">
                  {p4.documentsEmpty}
                </p>
              )}
            </section>
          )}

          <section className="rounded-xl border border-rule bg-paper p-4">
            <h2 className="text-sm font-medium text-muted">{F.activity}</h2>
            <ol className="ml-1 mt-3 space-y-3 border-l-2 border-rule">
              {recentEvents.map(eventItem)}
            </ol>
            {olderEvents.length > 0 && (
              <details className="group mt-3">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-brand hover:underline">
                  {F.showAll} ({olderEvents.length})
                  <ChevronDown
                    className="size-4 transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <ol className="ml-1 mt-3 space-y-3 border-l-2 border-rule">
                  {olderEvents.map(eventItem)}
                </ol>
              </details>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
