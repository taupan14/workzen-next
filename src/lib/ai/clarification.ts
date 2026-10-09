/** Draft permintaan klarifikasi ke customer. Dibuat dari pertanyaan AI, tidak dikirim otomatis. */
export function clarificationDraft(o: {
  lang: "id" | "en";
  name: string | null;
  subject: string;
  questions: string[];
}) {
  if (!o.questions.length) return "";
  const list = o.questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
  if (o.lang === "en") {
    return `Dear ${o.name ?? "Sir/Madam"},

Thank you for your request regarding "${o.subject}". So that we can process it, could you please confirm the following:

${list}

Once we receive this information we will continue with your request.

Kind regards,
[Your name]`;
  }
  return `Yth. ${o.name ?? "Bapak/Ibu"},

Terima kasih atas permintaan Anda mengenai "${o.subject}". Agar dapat kami proses, mohon konfirmasi informasi berikut:

${list}

Setelah informasi diterima, kami akan melanjutkan proses permintaan Anda.

Terima kasih.
[Nama Anda]`;
}
