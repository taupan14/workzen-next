/**
 * Workzen — Phase 4: fungsi Inngest untuk email dokumen (SDK Inngest v3: createFunction(options, triggers, handler)).
 * Daftarkan bersama fungsi yang sudah ada, memakai klien Inngest proyek:
 *
 *   import { createDocumentMailFunctions } from '@/inngest/document-mail-functions';
 *   serve({ client: inngest, functions: [...existingFunctions, ...createDocumentMailFunctions(inngest)] });
 */
import type { Inngest } from "inngest";
import {
  confirmCustomerSent,
  dispatchDocumentEmails,
  pollApprovalReplies,
} from "@/lib/documents/mail-flow";
import { createDocMailRuntime } from "@/lib/documents/runtime";

export function createDocumentMailFunctions(inngest: Inngest.Any) {
  const dispatch = inngest.createFunction(
    { id: "dispatch-document-emails", concurrency: 1 },
    [{ cron: "* * * * *" }, { event: "document/email.queued" }],
    async ({ step }) =>
      step.run("dispatch", async () => {
        const rt = createDocMailRuntime();
        return dispatchDocumentEmails(rt.db, rt.gmail);
      }),
  );

  const poll = inngest.createFunction(
    { id: "poll-approval-replies", concurrency: 1 },
    { cron: "*/2 * * * *" },
    async ({ step }) =>
      step.run("poll", async () => {
        const rt = createDocMailRuntime();
        return pollApprovalReplies(rt.db, rt.gmail);
      }),
  );

  const confirm = inngest.createFunction(
    { id: "confirm-customer-sent", concurrency: 1 },
    { cron: "*/2 * * * *" },
    async ({ step }) =>
      step.run("confirm", async () => {
        const rt = createDocMailRuntime();
        return confirmCustomerSent(rt.db, rt.gmail);
      }),
  );

  return [dispatch, poll, confirm];
}
