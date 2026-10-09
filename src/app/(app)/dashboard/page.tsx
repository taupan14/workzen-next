import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { serverClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { INQUIRY_TONE, timeAgo } from "@/lib/format";
import { Status } from "@/components/status";
import { AutoRefresh } from "@/components/auto-refresh";
import { p4EventLabel, p4Labels } from "@/lib/documents/labels";

type Counter = {
  label: string;
  value: number;
  tone?: "warn" | "danger";
  href?: string;
};

function CounterGrid({ items, label }: { items: Counter[]; label: string }) {
  return (
    <section aria-label={label}>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule md:grid-cols-4">
        {items.map((c) => {
          const body = (
            <>
              <dd
                className={`text-3xl font-semibold tabular-nums ${c.tone === "danger" ? "text-danger" : c.tone === "warn" ? "text-warn" : ""}`}
              >
                {c.value}
              </dd>
              <dt className="mt-1 flex items-center gap-1 text-xs text-muted">
                {c.label}
                {c.href && (
                  <ArrowUpRight
                    className="size-3 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                )}
              </dt>
            </>
          );
          return c.href ? (
            <Link
              key={c.label}
              href={c.href}
              className="group bg-paper px-4 py-4 transition-colors hover:bg-mist"
            >
              {body}
            </Link>
          ) : (
            <div key={c.label} className="bg-paper px-4 py-4">
              {body}
            </div>
          );
        })}
      </dl>
    </section>
  );
}

export default async function Dashboard() {
  const { lang, t } = await getI18n();
  const supabase = await serverClient();
  // Akun departemen tidak punya dashboard; arahkan ke daftar task departemennya.
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    const { data: me } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (me?.role === "dept_user") redirect("/tasks");
  }
  const [stats, queue, events, p4res] = await Promise.all([
    supabase.rpc("dashboard_stats"),
    supabase
      .from("inquiries")
      .select("id,inquiry_no,subject,from_name,from_email,received_at,status")
      .in("status", ["NEW", "NEEDS_REVIEW"])
      .order("received_at", { ascending: false })
      .limit(8),
    supabase
      .from("workflow_events")
      .select("id,event_type,created_at,inquiry_id")
      .order("id", { ascending: false })
      .limit(10),
    // Phase 4 (migrasi 0007). Bila migrasi belum dijalankan, bagian ini disembunyikan, halaman tetap jalan.
    supabase.rpc("phase4_dashboard"),
  ]);

  const s = (stats.data ?? {}) as Record<string, any>;
  const syncStale =
    !s.last_sync || Date.now() - new Date(s.last_sync).getTime() > 10 * 60_000;
  const bad = Boolean(s.last_sync_error) || (Boolean(s.last_sync) && syncStale);
  const d = t.dashboard;
  const p4t = p4Labels(lang);
  const p = (p4res.data ?? {}) as Record<string, number>;
  const showP4 = !p4res.error && p4res.data != null;
  let statsError: string | null = null;
  if (stats.error) {
    if (/forbidden/i.test(stats.error.message)) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const email = user?.email ?? "?";
      const { data: prof } = user
        ? await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle()
        : { data: null };
      statsError =
        prof?.role === "dept_user" ? d.deptAccount(email) : d.noAccess(email);
    } else {
      statsError = d.loadError;
    }
  }

  const counters: Counter[] = [
    { label: d.open, value: s.open_inquiries ?? 0, href: "/inquiries" },
    {
      label: d.awaiting,
      value: s.awaiting_validation ?? 0,
      tone: s.awaiting_validation > 0 ? "warn" : undefined,
      href: "/inquiries?tab=review",
    },
    {
      label: d.aiReview,
      value: s.needs_review ?? 0,
      tone: s.needs_review > 0 ? "warn" : undefined,
      href: "/inquiries?tab=review",
    },
    { label: d.active, value: s.tasks_active ?? 0, href: "/tasks?tab=active" },
    {
      label: d.blocked,
      value: s.tasks_blocked ?? 0,
      tone: s.tasks_blocked > 0 ? "danger" : undefined,
      href: "/tasks?tab=blocked",
    },
    {
      label: d.overdue,
      value: s.tasks_overdue ?? 0,
      tone: s.tasks_overdue > 0 ? "danger" : undefined,
      href: "/tasks?tab=overdue",
    },
    {
      label: d.replyReview,
      value: s.tasks_review ?? 0,
      tone: s.tasks_review > 0 ? "warn" : undefined,
      href: "/tasks?tab=review",
    },
    {
      label: d.failed,
      value: s.outbox_failed ?? 0,
      tone: s.outbox_failed > 0 ? "danger" : undefined,
    },
  ];

  const docCounters: Counter[] = [
    {
      label: p4t.pendingApproval,
      value: p.pending_approval ?? 0,
      tone: (p.pending_approval ?? 0) > 0 ? "warn" : undefined,
      href: "/documents?status=PENDING_APPROVAL",
    },
    {
      label: p4t.approvedUnsent,
      value: p.approved_not_sent ?? 0,
      tone: (p.approved_not_sent ?? 0) > 0 ? "warn" : undefined,
      href: "/documents?status=APPROVED",
    },
    {
      label: p4t.revisions,
      value: p.open_revision_requests ?? 0,
      tone: (p.open_revision_requests ?? 0) > 0 ? "warn" : undefined,
      href: "/documents?status=REVISION_REQUESTED",
    },
    {
      label: p4t.docEmailFailed,
      value: p.emails_failed ?? 0,
      tone: (p.emails_failed ?? 0) > 0 ? "danger" : undefined,
      href: "/documents",
    },
  ];

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{d.title}</h1>
          <p
            className={`mt-1 text-sm ${bad ? "text-danger" : "text-muted"}`}
            role={bad ? "alert" : undefined}
          >
            {s.last_sync_error
              ? d.syncError(s.last_sync_error)
              : s.last_sync
                ? d.syncOk(timeAgo(s.last_sync, lang)) +
                  (syncStale ? d.syncStale : "")
                : d.syncNever}
          </p>
        </div>
        <AutoRefresh label={t.common.refresh} />
      </header>

      {statsError && (
        <p
          role="alert"
          className="rounded-md border-l-4 border-danger bg-paper px-4 py-3 text-sm text-danger"
        >
          {statsError}
        </p>
      )}

      <CounterGrid items={counters} label={d.summary} />

      {showP4 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">{p4t.title}</h2>
          <CounterGrid items={docCounters} label={p4t.title} />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">{d.queueTitle}</h2>
        {queue.data?.length ? (
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
            {queue.data.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/inquiries/${q.id}`}
                  className="flex items-baseline justify-between gap-4 px-4 py-3 transition-colors hover:bg-mist"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {q.subject}
                    </span>
                    <span className="block truncate text-sm text-muted">
                      {q.inquiry_no} · {q.from_name ?? q.from_email}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm">
                    <Status
                      label={t.status.inquiry[q.status] ?? q.status}
                      tone={INQUIRY_TONE[q.status] ?? "muted"}
                    />
                    <span className="block text-muted">
                      {timeAgo(q.received_at, lang)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-rule bg-paper px-4 py-6 text-muted">
            {d.queueEmpty}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{d.activityTitle}</h2>
        <ol className="ml-1 space-y-3 border-l-2 border-rule">
          {(events.data ?? []).map((e) => {
            const label =
              t.status.events[e.event_type] ??
              p4EventLabel(lang, e.event_type) ??
              e.event_type;
            return (
              <li key={e.id} className="pl-4 text-sm">
                {e.inquiry_id ? (
                  <Link
                    href={`/inquiries/${e.inquiry_id}`}
                    className="font-medium hover:underline"
                  >
                    {label}
                  </Link>
                ) : (
                  <span className="font-medium">{label}</span>
                )}
                <span className="text-muted">
                  {" "}
                  · {timeAgo(e.created_at, lang)}
                </span>
              </li>
            );
          })}
          {!events.data?.length && (
            <li className="pl-4 text-sm text-muted">{d.activityEmpty}</li>
          )}
        </ol>
      </section>
    </div>
  );
}
