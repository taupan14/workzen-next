import { inngest } from "./client";
import {
  confirmCustomerSent,
  dispatchDocumentEmails,
  pollApprovalReplies,
} from "@/lib/documents/mail-flow";
import { createDocMailRuntime } from "@/lib/documents/runtime";

/**
 * Email dokumen (Phase 4). Gaya sama dengan functions.ts; didaftarkan di app/api/inngest/route.ts.
 * Semua langkah idempotent: kirim ulang tidak menggandakan email, balasan yang sama tidak diproses dua kali.
 */

/** Kirim email approval / buat draft customer. Dipicu event (cepat) + cron tiap menit (jaring pengaman). */
export const dispatchDocEmails = inngest.createFunction(
  { id: "dispatch-document-emails", concurrency: { limit: 1 }, retries: 2 },
  [{ cron: "* * * * *" }, { event: "document/email.queued" }],
  async ({ step }) =>
    step.run("dispatch", async () => {
      const rt = createDocMailRuntime();
      return dispatchDocumentEmails(rt.db, rt.gmail);
    }),
);

/** Baca balasan APPROVE / REVISE pada thread approval. Tiap 2 menit. */
export const pollDocApprovals = inngest.createFunction(
  { id: "poll-approval-replies", concurrency: { limit: 1 }, retries: 2 },
  { cron: "*/2 * * * *" },
  async ({ step }) =>
    step.run("poll", async () => {
      const rt = createDocMailRuntime();
      return pollApprovalReplies(rt.db, rt.gmail);
    }),
);

/** Buktikan draft customer benar-benar terkirim (label SENT / pesan di folder Sent). Tiap 2 menit. */
export const confirmDocSent = inngest.createFunction(
  { id: "confirm-customer-sent", concurrency: { limit: 1 }, retries: 2 },
  { cron: "*/2 * * * *" },
  async ({ step }) =>
    step.run("confirm", async () => {
      const rt = createDocMailRuntime();
      return confirmCustomerSent(rt.db, rt.gmail);
    }),
);

export const documentMailFunctions = [
  dispatchDocEmails,
  pollDocApprovals,
  confirmDocSent,
];
