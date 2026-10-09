"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { serverClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { inngest } from "@/inngest/client";
import { confidenceThreshold } from "@/lib/ai/config";

type Result = { error?: string; count?: number };

const errorCode = (m: string) =>
  /forbidden/i.test(m)
    ? "FORBIDDEN"
    : (/INVALID_ACTION|ITEM_NOT_FOUND|INQUIRY_NOT_FOUND|INQUIRY_CLOSED/.exec(
        m,
      )?.[0] ?? "UNKNOWN");
const refresh = (id: string) => revalidatePath(`/inquiries/${id}`);

export async function reviewItemAction(
  inquiryId: string,
  itemId: string,
  action: "ACCEPT" | "EDIT" | "REJECT" | "RESET",
  value?: string,
  department?: string,
): Promise<Result> {
  const supabase = await serverClient();
  const { error } = await supabase.rpc("review_ai_item", {
    p_item_id: itemId,
    p_action: action,
    p_value: value ?? null,
    p_department: department ?? null,
  });
  if (error) return { error: errorCode(error.message) };
  refresh(inquiryId);
  return {};
}

export async function acceptConfidentAction(
  inquiryId: string,
  extractionId: string,
): Promise<Result> {
  const supabase = await serverClient();
  const { data, error } = await supabase.rpc("review_ai_items_bulk", {
    p_extraction_id: extractionId,
    p_min: confidenceThreshold(),
  });
  if (error) return { error: errorCode(error.message) };
  refresh(inquiryId);
  return { count: Number(data ?? 0) };
}

export async function reanalyzeAction(inquiryId: string): Promise<Result> {
  const supabase = await serverClient();
  const { error } = await supabase.rpc("request_reanalysis", {
    p_inquiry_id: inquiryId,
  });
  if (error) return { error: errorCode(error.message) };
  try {
    await inngest.send({
      name: "inquiry/analyze",
      data: { inquiry_id: inquiryId, source: "manual" },
    });
  } catch {
    // Antrean tidak terjangkau: jangan biarkan status menggantung di PENDING.
    await adminClient().rpc("mark_ai_failed", {
      p_inquiry_id: inquiryId,
      p_error: "Gagal mengirim ke antrean Inngest. Pastikan Inngest berjalan.",
      p_run_key: `enqueue:${inquiryId}:${Date.now()}`,
    });
  }
  refresh(inquiryId);
  return {};
}

export async function dismissInquiryAction(inquiryId: string): Promise<Result> {
  const supabase = await serverClient();
  const { error } = await supabase.rpc("dismiss_inquiry", {
    p_inquiry_id: inquiryId,
    p_reason: "Bukan inquiry (keputusan sales setelah saran AI)",
  });
  if (error) return { error: errorCode(error.message) };
  revalidatePath("/inquiries");
  redirect("/inquiries");
}
