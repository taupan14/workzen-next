import Link from "next/link";
import { serverClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { TASK_TONE, fmtDate } from "@/lib/format";
import { TaskList, type TaskRow } from "./task-list";

const TABS = [
  "all",
  "active",
  "blocked",
  "overdue",
  "review",
  "submitted",
  "done",
] as const;
type Tab = (typeof TABS)[number];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: raw = "all" } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(raw)
    ? (raw as Tab)
    : "all";
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

  let q = supabase
    .from("tasks_with_flags")
    .select(
      "id,task_no,status,deadline,is_overdue,is_due_soon,is_ack_overdue,needs_review,departments(name),inquiries(inquiry_no,subject)",
    )
    .order("deadline", { ascending: true, nullsFirst: false })
    .limit(300);
  if (tab === "active")
    q = q.in("status", ["ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS"]);
  if (tab === "blocked") q = q.eq("status", "BLOCKED");
  if (tab === "overdue") q = q.eq("is_overdue", true);
  if (tab === "review") q = q.eq("needs_review", true);
  if (tab === "submitted") q = q.eq("status", "SUBMITTED");
  if (tab === "done") q = q.in("status", ["VERIFIED", "CANCELLED"]);
  const { data } = await q;

  const rows: TaskRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    code: `${r.inquiries?.inquiry_no ?? ""} · ${r.task_no}`.replace(/^ · /, ""),
    inquiryNo: r.inquiries?.inquiry_no ?? "",
    subject: r.inquiries?.subject ?? "",
    department: r.departments?.name ?? "",
    deadlineLabel: r.deadline ? fmtDate(r.deadline, lang, false) : null,
    statusLabel: t.status.task[r.status] ?? r.status,
    tone: TASK_TONE[r.status] ?? "muted",
    overdue: r.is_overdue,
    dueSoon: r.is_due_soon,
    ackOverdue: r.is_ack_overdue,
    review: r.needs_review,
  }));

  const k = t.tasks;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{k.title}</h1>
        {profile?.role === "dept_user" && (
          <p className="mt-1 text-sm text-muted">{k.deptHint}</p>
        )}
      </div>
      <nav
        className="flex gap-1 overflow-x-auto border-b border-rule text-sm"
        aria-label={k.filter}
      >
        {TABS.map((x) => (
          <Link
            key={x}
            href={x === "all" ? "/tasks" : `/tasks?tab=${x}`}
            aria-current={x === tab ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 transition-colors ${x === tab ? "border-brand font-medium" : "border-transparent text-muted hover:text-ink"}`}
          >
            {k.tabs[x]}
          </Link>
        ))}
      </nav>
      <TaskList
        key={tab}
        rows={rows}
        labels={{
          searchPlaceholder: k.searchPlaceholder,
          count: k.count,
          empty: k.empty,
          noMatch: k.noMatch,
          clear: "×",
          cols: k.cols,
          flags: k.flags,
        }}
      />
    </div>
  );
}
