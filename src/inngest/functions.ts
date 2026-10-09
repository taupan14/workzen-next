import { NonRetriableError } from "inngest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inngest } from "./client";
import { adminClient } from "@/lib/supabase/admin";
import {
  fetchParsedMessage,
  listRecentMessageIds,
  mailbox,
} from "@/lib/gmail/client";
import { claimOutbox, sendOutboxRow } from "@/lib/email/dispatch";
import {
  listPendingAttachments,
  processAttachment,
} from "@/lib/attachments/process";
import { loadContext } from "@/lib/ai/context";
import { buildSavePayload, callModel } from "@/lib/ai/analyze";
import { PROMPT_VERSION } from "@/lib/ai/prompt";
import { isPermanentLLMError } from "@/lib/ai/provider";
import {
  autoSubmitEnabled,
  buildReplyPayload,
  callReplyModel,
  loadReplyContext,
} from "@/lib/replies/parse";
import { REPLY_PROMPT_VERSION } from "@/lib/replies/prompt";

const MAX_PER_RUN = 25;
const aiRpm = () => Number(process.env.AI_MAX_RPM) || 5; // per fungsi AI; dua fungsi AI = maksimal 2x

type Rpc<T> = { data: T; error: { message: string } | null };
/** Error Supabase adalah objek biasa; bungkus agar pesan terbaca di Inngest. */
function must<T>(r: Rpc<T>, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

type IntakeResult = {
  status: string;
  inquiry_id?: string;
  task_id?: string;
  email_message_id?: string;
};

/** Poll Gmail tiap 2 menit. Idempotent: pesan yang sudah ada di DB dilewati. */
export const gmailPoll = inngest.createFunction(
  { id: "gmail-poll", concurrency: { limit: 1 }, retries: 2 },
  { cron: "*/2 * * * *" },
  async ({ step }) => {
    const db = adminClient();
    try {
      const newIds = await step.run("list-new", async () => {
        const ids = await listRecentMessageIds();
        if (!ids.length) return [] as string[];
        const rows = must(
          await db
            .from("email_messages")
            .select("gmail_message_id")
            .in("gmail_message_id", ids),
          "cek email",
        );
        const known = new Set((rows ?? []).map((r) => r.gmail_message_id));
        return ids.filter((id) => !known.has(id)).slice(0, MAX_PER_RUN);
      });

      const results: IntakeResult[] = [];
      for (const id of newIds) {
        const r = await step.run(`ingest-${id}`, async () => {
          const email = await fetchParsedMessage(id);
          if (email.from_email === mailbox())
            return { status: "skipped_self" } as IntakeResult;
          return must(
            await db.rpc("process_inbound_email", { p: email }),
            "intake",
          ) as IntakeResult;
        });
        results.push(r);
      }

      await step.run("record-sync", async () => {
        await db.from("email_sources").upsert({
          mailbox: mailbox(),
          last_polled_at: new Date().toISOString(),
          last_error: null,
          last_ingested_count: results.length,
        });
        // id event = idempotency: bila step ini diulang, analisis/parsing tidak berjalan dua kali.
        const events = [
          ...results
            .filter((r) => r.status === "new_inquiry" && r.inquiry_id)
            .map((r) => ({
              id: `inquiry-analyze:${r.inquiry_id}`,
              name: "inquiry/analyze",
              data: { inquiry_id: r.inquiry_id, source: "auto" },
            })),
          ...results
            .filter(
              (r) =>
                r.status === "task_reply" && r.task_id && r.email_message_id,
            )
            .map((r) => ({
              id: `reply-parse:${r.email_message_id}`,
              name: "task/reply-received",
              data: {
                task_id: r.task_id,
                email_message_id: r.email_message_id,
                source: "auto",
              },
            })),
        ];
        if (events.length) await inngest.send(events);
      });
      return { ingested: results.length };
    } catch (e) {
      await db.from("email_sources").upsert({
        mailbox: mailbox(),
        last_polled_at: new Date().toISOString(),
        last_error: String(e instanceof Error ? e.message : e).slice(0, 500),
      });
      throw e;
    }
  },
);

/** Kirim email dari outbox (task baru, pengingat, eskalasi): dipicu event (cepat) + cron tiap menit (jaring pengaman). */
export const dispatchOutbox = inngest.createFunction(
  { id: "dispatch-outbox", concurrency: { limit: 1 }, retries: 2 },
  [{ cron: "* * * * *" }, { event: "outbox/dispatch" }],
  async ({ step }) => {
    const rows = await step.run("claim", () => claimOutbox(10));
    const results = [];
    for (const row of rows)
      results.push(await step.run(`send-${row.id}`, () => sendOutboxRow(row)));
    return { claimed: rows.length, sent: results.filter((r) => r.ok).length };
  },
);

/**
 * Unduh dan baca lampiran yang belum diproses. Kegagalan satu lampiran dicatat (FAILED) dan tidak
 * menghentikan analisis; lampiran FAILED dicoba lagi pada analisis berikutnya.
 */
async function processPendingAttachments(
  step: { run: (id: string, fn: () => Promise<any>) => Promise<any> },
  db: SupabaseClient,
  filter: { inquiryId?: string; emailMessageId?: string },
) {
  const pending = (await step.run("list-attachments", () =>
    listPendingAttachments(db, filter),
  )) as Awaited<ReturnType<typeof listPendingAttachments>>;
  for (const a of pending) {
    await step.run(`attachment-${a.id}`, async () => {
      try {
        return await processAttachment(db, a);
      } catch (e) {
        const error = (e instanceof Error ? e.message : String(e)).slice(
          0,
          250,
        );
        await db.rpc("save_attachment_result", {
          p_id: a.id,
          p: { status: "FAILED", error },
        });
        return { id: a.id, status: "FAILED" };
      }
    });
  }
}

const runKeyFor = (ev: { id?: string; data: Record<string, any> }) =>
  ev.data.source === "manual"
    ? `manual:${ev.data.inquiry_id}:${ev.id}`
    : `auto:${ev.data.inquiry_id}:${PROMPT_VERSION}`;

/** Analisis AI atas satu inquiry: baca lampiran -> muat konteks -> panggil model -> validasi -> simpan atomik. */
export const analyzeInquiry = inngest.createFunction(
  {
    id: "analyze-inquiry",
    concurrency: { limit: 3 },
    // Paket gratis dibatasi per menit; throttle mencegah badai error 429.
    throttle: { limit: aiRpm(), period: "1m" },
    retries: 3,
    onFailure: async ({ event, error }) => {
      const original = event.data.event;
      const inquiryId = original.data?.inquiry_id as string | undefined;
      if (!inquiryId) return;
      await adminClient().rpc("mark_ai_failed", {
        p_inquiry_id: inquiryId,
        p_error: error.message,
        p_run_key: runKeyFor({ id: original.id, data: original.data }),
      });
    },
  },
  { event: "inquiry/analyze" },
  async ({ event, step }) => {
    const inquiryId = event.data.inquiry_id as string;
    const runKey = runKeyFor({ id: event.id, data: event.data });
    const db = adminClient();

    await step.run("mark-pending", async () => {
      must(
        await db.rpc("mark_ai_pending", { p_inquiry_id: inquiryId }),
        "mark pending",
      );
    });
    await processPendingAttachments(step, db, { inquiryId });
    const ctx = await step.run("load-context", () =>
      loadContext(db, inquiryId),
    );
    const result = await step.run("call-model", async () => {
      try {
        return await callModel(ctx);
      } catch (e) {
        // Kunci salah, model tidak ada, dsb: mengulang tidak membantu.
        if (isPermanentLLMError(e))
          throw new NonRetriableError((e as Error).message);
        throw e;
      }
    });
    return await step.run("save", async () =>
      must(
        await db.rpc("save_ai_extraction", {
          p: buildSavePayload({ ctx, result, runKey }),
        }),
        "simpan hasil AI",
      ),
    );
  },
);

const replyRunKeyFor = (ev: { id?: string; data: Record<string, any> }) =>
  ev.data.source === "manual"
    ? `manual:${ev.data.email_message_id}:${ev.id}`
    : `auto:${ev.data.email_message_id}:${REPLY_PROMPT_VERSION}`;

/**
 * Parsing balasan departemen: baca lampiran -> muat balasan (tanpa kutipan) -> model -> simpan.
 * Validasi biaya dan perubahan status task terjadi di database dalam satu transaksi.
 */
export const parseTaskReply = inngest.createFunction(
  {
    id: "parse-task-reply",
    concurrency: { limit: 3 },
    throttle: { limit: aiRpm(), period: "1m" },
    retries: 3,
    onFailure: async ({ event, error }) => {
      const original = event.data.event;
      const taskId = original.data?.task_id as string | undefined;
      if (!taskId) return;
      await adminClient().rpc("mark_reply_parse_failed", {
        p_task_id: taskId,
        p_error: error.message,
        p_run_key: replyRunKeyFor({ id: original.id, data: original.data }),
      });
    },
  },
  { event: "task/reply-received" },
  async ({ event, step }) => {
    const taskId = event.data.task_id as string;
    const emailId = event.data.email_message_id as string;
    const runKey = replyRunKeyFor({ id: event.id, data: event.data });
    const db = adminClient();

    await step.run("mark-pending", async () => {
      must(
        await db.rpc("mark_reply_parse_pending", { p_task_id: taskId }),
        "mark pending",
      );
    });
    await processPendingAttachments(step, db, { emailMessageId: emailId });
    const ctx = await step.run("load-context", () =>
      loadReplyContext(db, emailId),
    );
    const result = await step.run("call-model", async () => {
      try {
        return await callReplyModel(ctx);
      } catch (e) {
        if (isPermanentLLMError(e))
          throw new NonRetriableError((e as Error).message);
        throw e;
      }
    });
    return await step.run("save", async () =>
      must(
        await db.rpc("save_task_reply_parse", {
          p: buildReplyPayload({
            ctx,
            result,
            runKey,
            autoSubmit: autoSubmitEnabled(),
          }),
        }),
        "simpan hasil parsing",
      ),
    );
  },
);

/** Tiap 15 menit: antrekan pengingat dan eskalasi SLA (idempotent di database). */
export const slaSweep = inngest.createFunction(
  { id: "sla-sweep", concurrency: { limit: 1 }, retries: 2 },
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    const queued = await step.run("sweep", async () => {
      const r = must(
        await adminClient().rpc("sweep_task_sla"),
        "sweep sla",
      ) as { queued?: number };
      return r.queued ?? 0;
    });
    if (queued > 0)
      await step.sendEvent("dispatch", { name: "outbox/dispatch", data: {} });
    return { queued };
  },
);

export const functions = [
  gmailPoll,
  dispatchOutbox,
  analyzeInquiry,
  parseTaskReply,
  slaSweep,
];
