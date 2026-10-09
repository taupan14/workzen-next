import type { Tone } from "@/lib/format";

const DOT: Record<Tone, string> = {
  info: "bg-brand",
  warn: "bg-warn",
  ok: "bg-ok",
  muted: "bg-muted/50",
  danger: "bg-danger",
};

export function Status({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className={`size-2 rounded-full ${DOT[tone]}`} aria-hidden />
      {label}
    </span>
  );
}
