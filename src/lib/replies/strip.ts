export type Stripped = { text: string; stripped: boolean; fallback: boolean };

const ATTRIBUTION = /^(on|pada)\s.{5,250}\s(wrote|menulis)\s*:?$/i;
const SEPARATOR =
  /^-{2,}\s*(original message|pesan asli|forwarded message|pesan terusan|pesan yang diteruskan)/i;
const OUTLOOK_FROM = /^(from|dari):\s/i;
const OUTLOOK_NEXT = /^(sent|dikirim|date|tanggal):/i;
const SIGNATURE =
  /^(sent from my|dikirim dari|get outlook for|sent via|sent from outlook|dikirim melalui)/i;

/**
 * Buang riwayat kutipan dan tanda tangan dari balasan email, sisakan isi yang baru ditulis.
 * Baris berawalan ">" (kutipan inline) dibuang, tetapi jawaban di sela-selanya dipertahankan.
 * Bila hasilnya kosong, teks asli dipakai (fallback) agar tidak ada balasan yang hilang.
 */
export function stripQuotedReply(input: string): Stripped {
  const original = input.replace(/\r\n?/g, "\n").trim();
  const lines = original.split("\n");
  let cut = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    const joined = `${l} ${(lines[i + 1] ?? "").trim()}`.trim();
    const joined3 = `${joined} ${(lines[i + 2] ?? "").trim()}`.trim();
    const nextNonEmpty =
      lines
        .slice(i + 1, i + 4)
        .map((x) => x.trim())
        .find(Boolean) ?? "";
    if (
      ATTRIBUTION.test(l) ||
      (/^(on|pada)\s/i.test(l) &&
        (ATTRIBUTION.test(joined) || ATTRIBUTION.test(joined3))) ||
      SEPARATOR.test(l) ||
      (/^_{8,}$/.test(l) && OUTLOOK_FROM.test(nextNonEmpty)) ||
      (OUTLOOK_FROM.test(l) &&
        lines.slice(i + 1, i + 6).some((x) => OUTLOOK_NEXT.test(x.trim()))) ||
      lines[i] === "-- " ||
      l === "--" ||
      SIGNATURE.test(l)
    ) {
      cut = i;
      break;
    }
  }

  const kept = lines
    .slice(0, cut)
    .filter((l) => !/^\s*>/.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const stripped = cut < lines.length || kept.length < original.length;
  if (!kept) return { text: original, stripped: false, fallback: true };
  return { text: kept, stripped, fallback: false };
}
