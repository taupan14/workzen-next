import { fmtDate } from "@/lib/format";

export type EmailLang = "id" | "en" | "both";

export type TaskEmailInput = {
  inquiryNo: string;
  taskNo: string;
  inquirySubject: string;
  customerName: string | null;
  departmentName: string;
  scope: string;
  requiredOutput: string | null;
  deadline: string | null;
  customerMessage: string | null;
};

export const emailLang = (): EmailLang => {
  const v = process.env.EMAIL_LANG;
  return v === "en" || v === "both" ? v : "id";
};

export const taskSubject = (
  i: Pick<TaskEmailInput, "inquiryNo" | "taskNo" | "inquirySubject">,
) => `[${i.inquiryNo}][${i.taskNo}] ${i.inquirySubject}`;

const L = {
  id: {
    hello: (d: string) => `Halo tim ${d},`,
    intro: "Ada permintaan yang membutuhkan masukan dari departemen Anda.",
    inquiry: "Inquiry ",
    task: "Task    ",
    customer: "Customer",
    deadline: "Deadline",
    noDeadline: "belum ditentukan",
    scope: "Lingkup pekerjaan:",
    output: "Output yang dibutuhkan:",
    asScope: "Sesuai lingkup di atas.",
    howTo: "Cara membalas:",
    howToBody: (code: string) => [
      "Balas langsung email ini tanpa mengubah subjek. Kode " +
        code +
        " di subjek",
      "dipakai sistem untuk mencatat balasan Anda ke task yang benar.",
    ],
    ref: "Referensi — pesan customer:",
  },
  en: {
    hello: (d: string) => `Hello ${d} team,`,
    intro: "A request needs input from your department.",
    inquiry: "Inquiry ",
    task: "Task    ",
    customer: "Customer",
    deadline: "Deadline",
    noDeadline: "not set",
    scope: "Scope of work:",
    output: "Required output:",
    asScope: "As described in the scope above.",
    howTo: "How to reply:",
    howToBody: (code: string) => [
      "Reply directly to this email without changing the subject. The code " +
        code +
        " in the subject",
      "lets the system match your reply to the right task.",
    ],
    ref: "Reference — customer message:",
  },
} as const;

function bodyIn(lang: "id" | "en", i: TaskEmailInput) {
  const s = L[lang];
  const code = `[${i.inquiryNo}][${i.taskNo}]`;
  const excerpt = (i.customerMessage ?? "").trim().slice(0, 1500);
  return [
    s.hello(i.departmentName),
    ``,
    s.intro,
    ``,
    `${s.inquiry} : ${i.inquiryNo}`,
    `${s.task} : ${i.taskNo}`,
    `${s.customer.padEnd(8)} : ${i.customerName ?? "-"}`,
    `${s.deadline.padEnd(8)} : ${i.deadline ? fmtDate(i.deadline, lang, false) : s.noDeadline}`,
    ``,
    s.scope,
    i.scope,
    ``,
    s.output,
    i.requiredOutput ?? s.asScope,
    ``,
    s.howTo,
    ...s.howToBody(code),
    ``,
    excerpt
      ? `${s.ref}\n${excerpt
          .split("\n")
          .map((l) => "> " + l)
          .join("\n")}`
      : ``,
  ].join("\n");
}

export function taskBody(i: TaskEmailInput, lang: EmailLang = "id") {
  if (lang === "both")
    return `${bodyIn("id", i)}\n\n— — —\n\n${bodyIn("en", i)}`;
  return bodyIn(lang, i);
}

export type ReminderKind =
  | "REMINDER_ACK"
  | "REMINDER_DUE"
  | "REMINDER_OVERDUE"
  | "ESCALATION_ACK"
  | "ESCALATION_OVERDUE"
  | "ESCALATION_BLOCKED";

export const isReminderKind = (k: string): k is ReminderKind =>
  [
    "REMINDER_ACK",
    "REMINDER_DUE",
    "REMINDER_OVERDUE",
    "ESCALATION_ACK",
    "ESCALATION_OVERDUE",
    "ESCALATION_BLOCKED",
  ].includes(k);

export type ReminderInput = TaskEmailInput & {
  status: string;
  blocker: string | null;
  appUrl: string | null;
  taskId: string;
};

const R = {
  id: {
    kinds: {
      REMINDER_ACK: "Pengingat: mohon konfirmasi penerimaan",
      REMINDER_DUE: "Pengingat: deadline kurang dari 24 jam",
      REMINDER_OVERDUE: "Pengingat: melewati deadline",
      ESCALATION_ACK: "Eskalasi: task belum diakui departemen",
      ESCALATION_OVERDUE: "Eskalasi: task melewati deadline",
      ESCALATION_BLOCKED: "Eskalasi: task terhambat lebih dari 24 jam",
    } as Record<ReminderKind, string>,
    toDept: (d: string) => `Halo tim ${d},`,
    toSales: "Halo,",
    deptBody:
      "Task berikut masih memerlukan tindakan dari departemen Anda. Balas email ini untuk mengonfirmasi, mengirim hasil, atau menyampaikan kendala.",
    salesBody: "Task berikut memerlukan perhatian Anda.",
    inquiry: "Inquiry",
    status: "Status",
    dept: "Departemen",
    open: "Buka di Workzen",
    blocker: "Kendala",
  },
  en: {
    kinds: {
      REMINDER_ACK: "Reminder: please confirm receipt",
      REMINDER_DUE: "Reminder: due in less than 24 hours",
      REMINDER_OVERDUE: "Reminder: past the deadline",
      ESCALATION_ACK: "Escalation: task not acknowledged by the department",
      ESCALATION_OVERDUE: "Escalation: task is past its deadline",
      ESCALATION_BLOCKED: "Escalation: task blocked for more than 24 hours",
    } as Record<ReminderKind, string>,
    toDept: (d: string) => `Hello ${d} team,`,
    toSales: "Hello,",
    deptBody:
      "The task below still needs action from your department. Reply to this email to confirm, send the result, or report a blocker.",
    salesBody: "The task below needs your attention.",
    inquiry: "Inquiry",
    status: "Status",
    dept: "Department",
    open: "Open in Workzen",
    blocker: "Blocker",
  },
} as const;

/**
 * Pengingat ke departemen memakai kode [WZ-xxxx][KODE-nnn] di subjek, sehingga balasan tercatat ke task.
 * Eskalasi ke sales sengaja TANPA pasangan kurung itu, agar balasan sales tidak salah dibaca sebagai balasan departemen.
 */
export function reminderEmail(
  kind: ReminderKind,
  i: ReminderInput,
  lang: EmailLang = "id",
) {
  const toSales = kind.startsWith("ESCALATION");
  const one = (l: "id" | "en") => {
    const s = R[l];
    const head = toSales ? s.toSales : s.toDept(i.departmentName);
    return [
      head,
      "",
      s.kinds[kind],
      "",
      toSales ? s.salesBody : s.deptBody,
      "",
      `${s.inquiry}: ${i.inquiryNo}`,
      `Task: ${i.taskNo}`,
      `${s.dept}: ${i.departmentName}`,
      `${s.status}: ${i.status}`,
      `Deadline: ${i.deadline ? fmtDate(i.deadline, l, false) : "-"}`,
      i.blocker ? `${s.blocker}: ${i.blocker}` : "",
      "",
      `${L[l].scope}`,
      i.scope,
      i.appUrl
        ? `\n${s.open}: ${i.appUrl.replace(/\/$/, "")}/tasks/${i.taskId}`
        : "",
    ]
      .filter((x, idx, arr) => !(x === "" && arr[idx - 1] === ""))
      .join("\n");
  };
  const body =
    lang === "both" ? `${one("id")}\n\n— — —\n\n${one("en")}` : one(lang);
  const label = R[lang === "en" ? "en" : "id"].kinds[kind];
  const subject = toSales
    ? `${label} — ${i.inquiryNo} ${i.taskNo} (${i.departmentName})`
    : `[${i.inquiryNo}][${i.taskNo}] ${label}: ${i.inquirySubject}`;
  return { subject, body };
}

const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");

export function buildRaw(o: {
  from: string;
  to: string;
  subject: string;
  body: string;
  messageId: string;
}) {
  const lines = [
    `From: ${o.from}`,
    `To: ${o.to}`,
    `Reply-To: ${o.from}`,
    `Subject: =?UTF-8?B?${b64(o.subject)}?=`,
    `Message-ID: ${o.messageId}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    b64(o.body).replace(/(.{76})/g, "$1\r\n"),
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}
