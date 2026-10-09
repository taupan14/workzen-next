/**
 * Pemilihan pesan untuk intake inquiry (murni, mudah diuji).
 * - lewati pesan yang sudah ada di DB;
 * - lewati balasan pada thread approval dokumen (dibaca alur dokumen, bukan intake);
 * - baru SETELAH itu dipotong max, supaya pesan yang dilewati tidak memakan jatah pesan lain.
 */
export type MessageRef = { id: string; threadId: string };

export function pickIntakeIds(
  refs: MessageRef[],
  knownIds: Set<string>,
  documentThreadIds: Set<string>,
  max: number,
): string[] {
  return refs
    .filter((r) => !knownIds.has(r.id))
    .filter((r) => !r.threadId || !documentThreadIds.has(r.threadId))
    .map((r) => r.id)
    .slice(0, max);
}
