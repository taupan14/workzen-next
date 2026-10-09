/**
 * Workzen — Phase 4: memberi tahu Inngest bahwa ada email dokumen baru agar langsung dikirim.
 * Gagal = tidak masalah: cron tiap menit (dispatch-document-emails) menjadi jaring pengaman.
 */
import { inngest } from "@/inngest/client";

export async function notifyEmailQueued(documentId: string): Promise<void> {
  try {
    await inngest.send({ name: "document/email.queued", data: { documentId } });
  } catch {
    /* cron akan mengambilnya */
  }
}
