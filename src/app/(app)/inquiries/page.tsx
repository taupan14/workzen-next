import Link from "next/link";
import { serverClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { INQUIRY_TONE, fmtDate } from "@/lib/format";
import { InquiryList } from "./inquiry-list";

const TABS = [
  { key: "", statuses: null },
  { key: "review", statuses: ["NEW", "NEEDS_REVIEW"] },
  { key: "active", statuses: ["VALIDATED", "IN_PROGRESS"] },
  { key: "done", statuses: ["CLOSED", "CANCELLED"] },
] as const;
const TAB_LABEL = { "": "all", review: "review", active: "active", done: "done" } as const;

export default async function InquiriesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "" } = await searchParams;
  const { lang, t } = await getI18n();
  const active = TABS.find((x) => x.key === tab) ?? TABS[0];
  const supabase = await serverClient();

  let q = supabase
    .from("inquiries")
    .select("id,inquiry_no,subject,status,received_at,from_email,customers(name)")
    .order("received_at", { ascending: false })
    .limit(200);
  if (active.statuses) q = q.in("status", [...active.statuses]);
  const { data } = await q;

  const rows = (data ?? []).map((r: any) => ({
    id: r.id, no: r.inquiry_no, subject: r.subject,
    customer: r.customers?.name ?? r.from_email, email: r.from_email,
    receivedLabel: fmtDate(r.received_at, lang),
    statusLabel: t.status.inquiry[r.status] ?? r.status,
    tone: INQUIRY_TONE[r.status] ?? "muted",
  }));

  const i = t.inquiries;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{i.title}</h1>
      <nav className="flex gap-1 overflow-x-auto border-b border-rule text-sm" aria-label={i.filter}>
        {TABS.map((x) => {
          const on = x.key === active.key;
          return (
            <Link
              key={x.key}
              href={x.key ? `/inquiries?tab=${x.key}` : "/inquiries"}
              aria-current={on ? "page" : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 transition-colors ${on ? "border-brand font-medium" : "border-transparent text-muted hover:text-ink"}`}
            >
              {i.tabs[TAB_LABEL[x.key]]}
            </Link>
          );
        })}
      </nav>
      <InquiryList
        key={active.key}
        rows={rows}
        labels={{ searchPlaceholder: i.searchPlaceholder, count: i.count, empty: i.empty, noMatch: i.noMatch, clear: "×", cols: i.cols }}
      />
    </div>
  );
}
