/** Pesan Bahasa Indonesia untuk kode blocker/peringatan dari scenario_readiness() dan calc_issues. */
export const BLOCKER_MESSAGES: Record<string, string> = {
  SCENARIO_NOT_FOUND: "Skenario tidak ditemukan.",
  SCENARIO_CANCELLED: "Skenario sudah dibatalkan.",
  NO_LINES: "Belum ada baris biaya.",
  PENDING_REQUIREMENT: "Belum disahkan Sales (status Pending).",
  UNSORTED_SECTION: "Belum dimasukkan ke bagian dokumen (A-F).",
  EXCEPTION_WITHOUT_NOTE: "Pengecualian wajib punya catatan tertulis.",
  ESTIMATE_NOT_APPROVED: "Estimate belum berstatus Approved Estimate.",
  LINE_ISSUE: "Data baris belum valid.",
  NOT_CALCULATED: "Belum dihitung. Klik Hitung ulang.",
  TASK_NOT_VERIFIED: "Task sumber belum Verified.",
  OPEN_TASK: "Task skenario ini belum Verified.",
};

export const WARNING_MESSAGES: Record<string, string> = {
  NO_VALIDITY: "Rate tanpa masa berlaku.",
  TAX_RULE_UNCONFIRMED: "Aturan pajak belum disahkan FAT.",
  BANK_MASTER_UNCONFIRMED:
    "Rekening bank belum disahkan FAT (tidak dicetak di dokumen).",
  CONDITIONAL_NOT_IN_TOTAL:
    "Ada biaya bersyarat; ditampilkan terpisah dan tidak masuk total.",
};

export const ISSUE_MESSAGES: Record<string, string> = {
  MISSING_QTY: "Qty kosong",
  MISSING_UOM: "Unit kosong/ambigu",
  MISSING_RATE: "Rate kosong (bukan nol)",
  NEGATIVE_VALUE: "Nilai negatif",
  MISSING_CURRENCY: "Currency kosong",
  MISSING_FX: "Kurs belum ada",
  RATE_EXPIRED: "Rate kedaluwarsa",
  MISSING_PARENT: "Baris induk tidak ada",
  BAD_PARENT: "Induk bukan baris qty × rate",
  PARENT_INCOMPLETE: "Induk belum lengkap",
  MISSING_PERCENT: "Persen kosong",
};

export const describeCode = (map: Record<string, string>, code: string) =>
  map[code] ?? code;

/** Terjemahkan galat SQL/aksi menjadi pesan yang bisa dibaca. */
export function friendlyError(raw: string): string {
  if (raw.startsWith("NOT_READY"))
    return "Dokumen belum bisa dibuat: masih ada hal yang harus diselesaikan (lihat panel Kesiapan).";
  const known: Array<[RegExp, string]> = [
    [/FORBIDDEN/, "Anda tidak memiliki hak untuk aksi ini."],
    [
      /RECIPIENT_NOT_ALLOWED/,
      "Alamat penerima tidak ada di daftar alamat uji yang diizinkan.",
    ],
    [/DOC_NOT_APPROVED/, "Dokumen belum disetujui."],
    [/DOC_NOT_DRAFT/, "Dokumen sudah tidak berstatus Draft."],
    [/PDF_MISSING/, "PDF belum dibuat."],
    [
      /NO_APPROVER_CONFIGURED/,
      "Belum ada approver terdaftar untuk jenis dokumen ini.",
    ],
    [/EXCEPTION_NOTE_REQUIRED/, "Pengecualian wajib punya catatan."],
    [/TEMPLATE_NOT_FOUND/, "Template dokumen aktif belum ada."],
    [/NUMBERING_NOT_CONFIGURED/, "Penomoran dokumen belum dikonfigurasi."],
    [/duplicate key/i, "Data dengan kode yang sama sudah ada."],
  ];
  for (const [re, msg] of known) if (re.test(raw)) return msg;
  return raw.slice(0, 300);
}
