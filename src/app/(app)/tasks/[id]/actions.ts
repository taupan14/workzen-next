"use server";

import { revalidatePath } from "next/cache";
import { serverClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { inngest } from "@/inngest/client";

type Result = { error?: string };

const KNOWN =
  /INVALID_TRANSITION|BLOCKER_REQUIRED|NOTE_REQUIRED|ITEMS_NEED_REVIEW|TASK_NOT_FOUND|INVALID_ACTION|ITEM_NOT_FOUND/;
const errorCode = (m: string) =>
  /forbidden/i.test(m) ? "FORBIDDEN" : (KNOWN.exec(m)?.[0] ?? "UNKNOWN");
const refresh = (id: string) => {
  revalidatePath(`/tasks/${id}`);
  revalidatePath("/tasks");
};

export async function changeStatusAction(
  taskId: string,
  to: string,
  note?: string,
  blocker?: string,
): Promise<Result> {
  const supabase = await serverClient();
  const { error } = await supabase.rpc("set_task_status", {
    p_task_id: taskId,
    p_to: to,
    p_note: note?.trim() || null,
    p_blocker: blocker?.trim() || null,
  });
  if (error) return { error: errorCode(error.message) };
  refresh(taskId);
  return {};
}

const NUMERIC = ["quantity", "rate"] as const;
const TEXT = [
  "vendor",
  "item",
  "uom",
  "currency",
  "validity",
  "availability",
  "notes",
] as const;

export async function reviewCostItemAction(
  taskId: string,
  itemId: string,
  action: "ACCEPT" | "EDIT" | "REJECT" | "RESET",
  fields?: Record<string, string>,
): Promise<Result> {
  let payload: Record<string, string> | null = null;
  if (action === "EDIT" && fields) {
    payload = {};
    for (const k of TEXT) if (k in fields) payload[k] = String(fields[k] ?? "");
    for (const k of NUMERIC) {
      if (!(k in fields)) continue;
      // Terima "12500" atau "12500.5"; format ribuan lokal ("12.500") ditolak agar tidak salah baca.
      const v = String(fields[k] ?? "").trim();
      if (v !== "" && !/^\d+(\.\d+)?$/.test(v))
        return { error: "INVALID_NUMBER" };
      payload[k] = v;
    }
    if (payload.validity && !/^\d{4}-\d{2}-\d{2}$/.test(payload.validity))
      return { error: "INVALID_ACTION" };
  }
  const supabase = await serverClient();
  const { error } = await supabase.rpc("review_cost_item", {
    p_id: itemId,
    p_action: action,
    p_fields: payload,
  });
  if (error) return { error: errorCode(error.message) };
  refresh(taskId);
  return {};
}

export async function resolveReviewAction(
  taskId: string,
  parseId: string,
): Promise<Result> {
  const supabase = await serverClient();
  const { error } = await supabase.rpc("resolve_reply_review", {
    p_parse_id: parseId,
  });
  if (error) return { error: errorCode(error.message) };
  refresh(taskId);
  return {};
}

export async function reparseAction(taskId: string): Promise<Result> {
  const supabase = await serverClient();
  // Balasan terbaru dari departemen (RLS menentukan apakah user boleh melihatnya).
  const { data: mail } = await supabase
    .from("email_messages")
    .select("id")
    .eq("task_id", taskId)
    .eq("direction", "INBOUND")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!mail) return { error: "TASK_NOT_FOUND" };

  const { error } = await supabase.rpc("request_reparse", {
    p_task_id: taskId,
  });
  if (error) return { error: errorCode(error.message) };
  try {
    await inngest.send({
      name: "task/reply-received",
      data: { task_id: taskId, email_message_id: mail.id, source: "manual" },
    });
  } catch {
    // Antrean tidak terjangkau: jangan biarkan status menggantung di PENDING.
    await adminClient().rpc("mark_reply_parse_failed", {
      p_task_id: taskId,
      p_error: "Gagal mengirim ke antrean Inngest. Pastikan Inngest berjalan.",
      p_run_key: `enqueue:${taskId}:${Date.now()}`,
    });
  }
  refresh(taskId);
  return {};
}
