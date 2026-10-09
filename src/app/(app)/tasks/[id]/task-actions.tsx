"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

export type ActionDef = {
  to: string;
  label: string;
  tone: "primary" | "danger" | "neutral";
  needs: "blocker" | "note-required" | "note-optional" | "confirm" | null;
};
type Strings = {
  blockerLabel: string;
  blockerPh: string;
  noteRequired: string;
  noteOptional: string;
  confirm: string;
  cancelForm: string;
  saving: string;
  confirmCancel: string;
};

const TONE = {
  primary: "bg-brand text-on-brand hover:bg-brand-ink border-transparent",
  danger: "border-danger text-danger hover:bg-mist",
  neutral: "border-rule bg-field hover:border-brand",
} as const;
const field =
  "w-full rounded-md border border-rule bg-field px-3 py-2 text-sm focus-visible:border-brand";

export function TaskActions(props: {
  actions: ActionDef[];
  strings: Strings;
  errors: Record<string, string>;
  change: (
    to: string,
    note?: string,
    blocker?: string,
  ) => Promise<{ error?: string }>;
}) {
  const { actions, strings: s, errors } = props;
  const [open, setOpen] = useState<ActionDef | null>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const run = (a: ActionDef, value?: string) =>
    start(async () => {
      setErr(null);
      const r = await props.change(
        a.to,
        a.needs === "blocker" ? undefined : value,
        a.needs === "blocker" ? value : undefined,
      );
      if (r.error) setErr(errors[r.error] ?? errors.UNKNOWN);
      else {
        setOpen(null);
        setText("");
      }
    });

  const click = (a: ActionDef) => {
    setErr(null);
    if (!a.needs) return run(a);
    setOpen(a);
    setText("");
  };

  const mustFill = open?.needs === "blocker" || open?.needs === "note-required";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.to + a.label}
            type="button"
            disabled={pending}
            onClick={() => click(a)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition active:scale-[.98] disabled:opacity-50 ${TONE[a.tone]} ${open?.label === a.label ? "ring-2 ring-brand" : ""}`}
          >
            {pending && open?.label === a.label && (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            )}
            {a.label}
          </button>
        ))}
      </div>

      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (open.needs === "confirm" && !window.confirm(s.confirmCancel))
              return;
            run(open, text);
          }}
          className="max-w-xl space-y-2 rounded-xl border border-rule bg-paper p-4"
        >
          {
            <label className="block text-sm">
              <span className="mb-1 block text-muted">
                {open.needs === "blocker"
                  ? s.blockerLabel
                  : open.needs === "note-required"
                    ? s.noteRequired
                    : s.noteOptional}
              </span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                required={mustFill}
                autoFocus
                placeholder={open.needs === "blocker" ? s.blockerPh : undefined}
                className={field}
              />
            </label>
          }
          <div className="flex gap-2">
            <button
              disabled={pending || (mustFill && !text.trim())}
              className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${open.tone === "danger" ? "border border-danger text-danger" : "bg-brand text-on-brand hover:bg-brand-ink"}`}
            >
              {pending && (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              )}{" "}
              {pending ? s.saving : `${s.confirm}: ${open.label}`}
            </button>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="rounded-md border border-rule bg-field px-3 py-2 text-sm hover:border-brand"
            >
              {s.cancelForm}
            </button>
          </div>
        </form>
      )}
      {err && (
        <p role="alert" className="text-sm text-danger">
          {err}
        </p>
      )}
    </div>
  );
}
