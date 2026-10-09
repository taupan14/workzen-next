/**
 * Workzen — Phase 4: memberi tahu Inngest bahwa ada email dokumen baru agar langsung dikirim.
 * Memakai HTTP Event API (tanpa klien Inngest). Gagal = tidak masalah: cron tiap menit menjadi jaring pengaman.
 */
export async function notifyEmailQueued(documentId: string): Promise<void> {
  const key =
    process.env.INNGEST_EVENT_KEY ??
    (process.env.NODE_ENV !== "production" ? "local" : "");
  if (!key) return;
  const base =
    process.env.INNGEST_BASE_URL ??
    (process.env.NODE_ENV !== "production"
      ? "http://localhost:8288"
      : "https://inn.gs");
  try {
    await fetch(`${base}/e/${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "document/email.queued",
        data: { documentId },
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* cron akan mengambilnya */
  }
}
