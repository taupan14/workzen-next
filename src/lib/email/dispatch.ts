import { adminClient } from "@/lib/supabase/admin";
import { gmailClient, mailbox } from "@/lib/gmail/client";
import {
  buildRaw,
  emailLang,
  isReminderKind,
  reminderEmail,
  taskBody,
  taskSubject,
  type TaskEmailInput,
} from "./task-email";

export type OutboxRow = {
  id: string;
  task_id: string;
  kind: string;
  to_email: string;
  attempts: number;
};

export async function claimOutbox(limit = 10): Promise<OutboxRow[]> {
  const { data, error } = await adminClient().rpc("claim_outbox", {
    p_limit: limit,
  });
  if (error) throw new Error(`claim_outbox: ${error.message}`);
  return (data ?? []) as OutboxRow[];
}

/**
 * Kirim satu email dari outbox (task baru, pengingat, atau eskalasi). Tidak melempar error:
 * kegagalan dicatat di outbox dengan backoff, sehingga satu email bermasalah tidak menghentikan antrean.
 */
export async function sendOutboxRow(
  row: OutboxRow,
): Promise<{ id: string; ok: boolean; error?: string }> {
  const db = adminClient();
  try {
    const { data, error } = await db
      .from("tasks")
      .select(
        "id,task_no,scope,required_output,deadline,status,blocker,inquiry_id,departments(name),inquiries(inquiry_no,subject,body_text,customers(name))",
      )
      .eq("id", row.task_id)
      .single();
    if (error) throw new Error(`tugas tidak ditemukan: ${error.message}`);
    const t = data as any;

    const input: TaskEmailInput = {
      inquiryNo: t.inquiries.inquiry_no,
      taskNo: t.task_no,
      inquirySubject: t.inquiries.subject,
      customerName: t.inquiries.customers?.name ?? null,
      departmentName: t.departments.name,
      scope: t.scope,
      requiredOutput: t.required_output,
      deadline: t.deadline,
      customerMessage: t.inquiries.body_text,
    };
    const lang = emailLang();
    const { subject, body } = isReminderKind(row.kind)
      ? reminderEmail(
          row.kind,
          {
            ...input,
            status: t.status,
            blocker: t.blocker,
            appUrl: process.env.APP_URL ?? null,
            taskId: t.id,
          },
          lang,
        )
      : { subject: taskSubject(input), body: taskBody(input, lang) };

    // Cegah kirim ganda jika proses sebelumnya berhasil kirim tapi gagal menyimpan status.
    const gmail = gmailClient();
    const messageId = `<wz-outbox-${row.id}@workzen.local>`;
    const existing = await gmail.users.messages.list({
      userId: "me",
      q: `rfc822msgid:${messageId}`,
      maxResults: 1,
    });
    let sent = existing.data.messages?.[0];
    if (!sent) {
      const res = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: buildRaw({
            from: mailbox(),
            to: row.to_email,
            subject,
            body,
            messageId,
          }),
        },
      });
      sent = { id: res.data.id, threadId: res.data.threadId };
    }

    await db.from("email_messages").upsert(
      {
        inquiry_id: t.inquiry_id,
        task_id: t.id,
        direction: "OUTBOUND",
        gmail_message_id: sent.id!,
        gmail_thread_id: sent.threadId,
        rfc_message_id: messageId,
        from_email: mailbox(),
        to_emails: [row.to_email],
        subject,
        body_text: body,
        received_at: new Date().toISOString(),
      },
      { onConflict: "gmail_message_id", ignoreDuplicates: true },
    );
    await db
      .from("email_outbox")
      .update({
        status: "SENT",
        sent_at: new Date().toISOString(),
        gmail_message_id: sent.id,
        last_error: null,
      })
      .eq("id", row.id);
    await db.rpc("log_event", {
      p_type:
        row.kind === "TASK_ASSIGNED" ? "task.email_sent" : "task.reminder_sent",
      p_entity_type: "task",
      p_entity_id: t.id,
      p_inquiry_id: t.inquiry_id,
      p_payload: { to: row.to_email, kind: row.kind },
      p_key: `task.email_sent:${row.id}`,
    });
    return { id: row.id, ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const backoffMin = Math.min(60, row.attempts ** 2);
    await db
      .from("email_outbox")
      .update({
        status: "FAILED",
        last_error: message.slice(0, 500),
        next_attempt_at: new Date(
          Date.now() + backoffMin * 60_000,
        ).toISOString(),
      })
      .eq("id", row.id);
    await db.rpc("log_event", {
      p_type: "task.email_failed",
      p_entity_type: "task",
      p_entity_id: row.task_id,
      p_inquiry_id: null,
      p_payload: {
        error: message.slice(0, 200),
        attempt: row.attempts,
        kind: row.kind,
      },
      p_key: `task.email_failed:${row.id}:${row.attempts}`,
    });
    return { id: row.id, ok: false, error: message };
  }
}
