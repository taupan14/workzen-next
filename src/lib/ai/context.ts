import type { SupabaseClient } from "@supabase/supabase-js";
import type { PromptContext } from "./prompt";

export type AnalysisContext = PromptContext & {
  inquiry_id: string;
  inquiry_no: string;
  customer_name: string | null;
  email_message_id: string | null;
};

const MAX_MESSAGES = 6;
const MAX_CHARS = 6000;

function must<T>(
  r: { data: T; error: { message: string } | null },
  what: string,
): NonNullable<T> {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  if (r.data == null) throw new Error(`${what}: data kosong`);
  return r.data as NonNullable<T>;
}

/** Kumpulkan data yang dibutuhkan model: thread dari customer, lampiran (nama saja), dan master departemen. */
export async function loadContext(
  db: SupabaseClient,
  inquiryId: string,
): Promise<AnalysisContext> {
  const inq: any = must(
    await db
      .from("inquiries")
      .select("id,inquiry_no,subject,received_at,customers(name)")
      .eq("id", inquiryId)
      .single(),
    "inquiry",
  );
  const msgs: any[] = must(
    await db
      .from("email_messages")
      .select("id,from_email,from_name,subject,body_text,received_at")
      .eq("inquiry_id", inquiryId)
      .eq("direction", "INBOUND")
      .is("task_id", null)
      .order("received_at"),
    "email",
  );
  if (!msgs.length)
    throw new Error("Inquiry belum punya email masuk untuk dianalisis");

  const picked =
    msgs.length > MAX_MESSAGES
      ? [msgs[0], ...msgs.slice(-(MAX_MESSAGES - 1))]
      : msgs;
  const attachments: any[] = must(
    await db
      .from("attachments")
      .select("filename,mime_type,size_bytes,process_status,extracted_text")
      .eq("inquiry_id", inquiryId)
      .order("created_at"),
    "lampiran",
  );
  const departments: any[] = must(
    await db
      .from("departments")
      .select("code,name,description")
      .eq("is_active", true)
      .order("code"),
    "departemen",
  );

  return {
    inquiry_id: inq.id,
    inquiry_no: inq.inquiry_no,
    customer_name: inq.customers?.name ?? null,
    email_message_id: msgs[0].id,
    receivedAt: inq.received_at,
    departments,
    attachments: attachments.map((a) => ({
      filename: a.filename,
      mime_type: a.mime_type,
      size_bytes: a.size_bytes,
      status: a.process_status,
      text: a.extracted_text,
    })),
    messages: picked.map((m) => ({
      from: m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email,
      received_at: m.received_at,
      text: `Subject: ${m.subject ?? ""}\n\n${String(m.body_text ?? "").slice(0, MAX_CHARS)}`,
    })),
  };
}
