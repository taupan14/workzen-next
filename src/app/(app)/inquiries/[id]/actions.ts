"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { serverClient } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";

const errorCode = (m: string) =>
  /forbidden/i.test(m) ? "FORBIDDEN" : (/NO_DEPARTMENT|INQUIRY_NOT_FOUND|INQUIRY_CLOSED/.exec(m)?.[0] ?? "UNKNOWN");

export async function createTasksAction(inquiryId: string, formData: FormData) {
  const ids = formData.getAll("department_id").map(String);
  const back = `/inquiries/${inquiryId}`;
  if (!ids.length) redirect(`${back}?error=NO_DEPARTMENT`);

  const items = ids.map((id) => {
    const date = String(formData.get(`deadline_${id}`) ?? "");
    return {
      department_id: id,
      scope: String(formData.get(`scope_${id}`) ?? ""),
      required_output: String(formData.get(`output_${id}`) ?? ""),
      deadline: date ? `${date}T23:59:59+07:00` : null, // akhir hari WIB
      requirement_key: "general",
    };
  });

  const supabase = await serverClient();
  const { error } = await supabase.rpc("create_tasks_for_inquiry", { p_inquiry_id: inquiryId, p_items: items });
  if (error) redirect(`${back}?error=${errorCode(error.message)}`);

  try {
    await inngest.send({ name: "outbox/dispatch", data: {} }); // percepat; cron tetap menyapu outbox
  } catch {
    /* outbox akan terkirim oleh cron */
  }
  revalidatePath(back);
  redirect(back);
}
