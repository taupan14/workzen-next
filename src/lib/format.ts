import type { Lang } from "./i18n/dictionaries";

export type Tone = "info" | "warn" | "ok" | "muted" | "danger";

export const INQUIRY_TONE: Record<string, Tone> = {
  NEW: "warn", NEEDS_REVIEW: "warn", VALIDATED: "info", IN_PROGRESS: "info", CLOSED: "ok", CANCELLED: "muted",
};
export const TASK_TONE: Record<string, Tone> = {
  ASSIGNED: "warn", ACKNOWLEDGED: "info", IN_PROGRESS: "info", BLOCKED: "danger", SUBMITTED: "info", VERIFIED: "ok", CANCELLED: "muted",
};

const LOCALE: Record<Lang, string> = { id: "id-ID", en: "en-GB" };

export function fmtDate(iso: string, lang: Lang, withTime = true) {
  return new Intl.DateTimeFormat(LOCALE[lang], {
    timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(iso));
}

export function timeAgo(iso: string, lang: Lang) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(LOCALE[lang], { numeric: "auto" });
  if (s < 60) return lang === "id" ? "baru saja" : "just now";
  if (s < 3600) return rtf.format(-Math.floor(s / 60), "minute");
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), "hour");
  return rtf.format(-Math.floor(s / 86400), "day");
}
