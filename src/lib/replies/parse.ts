import type { SupabaseClient } from "@supabase/supabase-js";
import { confidenceThreshold } from "@/lib/ai/config";
import { verifyQuote } from "@/lib/ai/analyze";
import { renderAttachments, type PromptAttachment } from "@/lib/ai/prompt";
import { getProvider } from "@/lib/ai/provider";
import {
  REPLY_PROMPT_VERSION,
  REPLY_SYSTEM_PROMPT,
  buildReplyPrompt,
  renderReply,
  type ReplyPromptContext,
} from "./prompt";
import { REPLY_JSON_SCHEMA, ReplyOutput, type ReplyOutputT } from "./schema";
import { stripQuotedReply } from "./strip";

export type ReplyContext = ReplyPromptContext & {
  task_id: string;
  email_message_id: string;
};

function must<T>(
  r: { data: T; error: { message: string } | null },
  what: string,
): NonNullable<T> {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  if (r.data == null) throw new Error(`${what}: data kosong`);
  return r.data as NonNullable<T>;
}

/** Muat balasan departemen (tanpa kutipan dan tanda tangan) beserta konteks task dan lampirannya. */
export async function loadReplyContext(
  db: SupabaseClient,
  emailMessageId: string,
): Promise<ReplyContext> {
  const email: any = must(
    await db
      .from("email_messages")
      .select("id,task_id,direction,from_email,from_name,body_text,received_at")
      .eq("id", emailMessageId)
      .single(),
    "email balasan",
  );
  if (!email.task_id || email.direction !== "INBOUND")
    throw new Error("Email ini bukan balasan untuk sebuah task");
  const task: any = must(
    await db
      .from("tasks")
      .select(
        "id,task_no,scope,required_output,deadline,departments(name),inquiries(inquiry_no)",
      )
      .eq("id", email.task_id)
      .single(),
    "task",
  );
  const atts: any[] = must(
    await db
      .from("attachments")
      .select("filename,mime_type,size_bytes,process_status,extracted_text")
      .eq("email_message_id", emailMessageId)
      .order("created_at"),
    "lampiran",
  );
  const stripped = stripQuotedReply(String(email.body_text ?? ""));
  return {
    task_id: task.id,
    email_message_id: email.id,
    today: new Date().toISOString().slice(0, 10),
    task_no: task.task_no,
    inquiry_no: task.inquiries.inquiry_no,
    department: task.departments.name,
    scope: task.scope,
    required_output: task.required_output,
    deadline: task.deadline,
    reply_from: email.from_name
      ? `${email.from_name} <${email.from_email}>`
      : email.from_email,
    reply_text: stripped.text.slice(0, 8000),
    attachments: atts.map((a) => ({
      filename: a.filename,
      mime_type: a.mime_type,
      size_bytes: a.size_bytes,
      status: a.process_status,
      text: a.extracted_text,
    })) as PromptAttachment[],
  };
}

export type ReplyModelResult = {
  output: ReplyOutputT;
  model: string;
  provider: string;
  usage: { input_tokens: number; output_tokens: number };
};

export async function callReplyModel(
  ctx: ReplyContext,
): Promise<ReplyModelResult> {
  const provider = await getProvider();
  const res = await provider.call({
    system: REPLY_SYSTEM_PROMPT,
    user: buildReplyPrompt(ctx),
    toolName: "record_reply_analysis",
    toolDescription: "Record the structured analysis of the department reply.",
    inputSchema: REPLY_JSON_SCHEMA as unknown as Record<string, unknown>,
  });
  const parsed = ReplyOutput.safeParse(res.output);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `Output model tidak valid: ${issue?.path.join(".")} ${issue?.message}`,
    );
  }
  return {
    output: parsed.data,
    model: res.model,
    provider: provider.name,
    usage: res.usage,
  };
}

const CURRENCY_ALIASES: Record<string, string> = {
  RP: "IDR",
  "RP.": "IDR",
  RUPIAH: "IDR",
  IDR: "IDR",
  US$: "USD",
  $: "USD",
  USD: "USD",
  DOLLAR: "USD",
  S$: "SGD",
  "€": "EUR",
  EURO: "EUR",
};
export const normalizeCurrency = (raw: string | null): string | null => {
  const k = raw?.trim().toUpperCase();
  return k ? (CURRENCY_ALIASES[k] ?? k) : null;
};

const round3 = (n: number) =>
  Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Susun payload untuk save_task_reply_parse. Di sini hanya normalisasi dan pembuktian kutipan;
 * validasi biaya dan keputusan status dilakukan di database (satu sumber aturan bisnis).
 */
export function buildReplyPayload(args: {
  ctx: ReplyContext;
  result: ReplyModelResult;
  runKey: string;
  autoSubmit: boolean;
  threshold?: number;
}) {
  const { ctx, result, runKey } = args;
  const o = result.output;
  const haystack = `${renderReply(ctx.reply_text)}\n${renderAttachments(ctx.attachments)}`;

  const items = o.cost_items
    .filter((c) => c.item || c.vendor || c.rate !== null) // buang baris kosong
    .map((c) => {
      const verified = verifyQuote(c.source_quote, haystack);
      return {
        vendor: c.vendor?.trim() || null,
        item: c.item?.trim() || null,
        quantity: c.quantity,
        uom: c.uom?.trim() || null,
        rate: c.rate,
        currency: normalizeCurrency(c.currency),
        validity:
          c.validity && ISO_DATE.test(c.validity.trim())
            ? c.validity.trim()
            : null,
        availability: c.availability?.trim() || null,
        notes: c.notes?.trim() || null,
        // Nilai tanpa kutipan yang terbukti ada di balasan tidak boleh tampil "yakin".
        confidence: round3(
          verified ? c.confidence : Math.min(c.confidence, 0.5),
        ),
        source_text: c.source_quote,
        source_verified: verified,
      };
    });

  return {
    task_id: ctx.task_id,
    email_message_id: ctx.email_message_id,
    run_key: runKey,
    prompt_version: REPLY_PROMPT_VERSION,
    provider: result.provider,
    model: result.model,
    intent: o.intent,
    intent_confidence: round3(o.intent_confidence),
    summary: o.summary,
    blocker: o.blocker?.trim() || null,
    questions: o.questions,
    ambiguities: o.ambiguities,
    usage: result.usage,
    auto_submit: args.autoSubmit,
    threshold: args.threshold ?? confidenceThreshold(),
    items,
  };
}

/** Penyerahan otomatis dapat dimatikan dengan TASK_AUTO_SUBMIT=false (semua balasan lalu masuk review manusia). */
export const autoSubmitEnabled = () =>
  process.env.TASK_AUTO_SUBMIT?.toLowerCase() !== "false";
