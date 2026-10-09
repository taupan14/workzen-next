"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Sparkles } from "lucide-react";

type Dept = {
  id: string;
  name: string;
  email: string | null;
  badges: ("ai" | "rule")[];
  reason?: string;
  defaultScope?: string;
  already: boolean;
};
type Labels = {
  suggestedAi: string;
  suggestedRule: string;
  already: string;
  noEmail: string;
  scope: string;
  scopePh: string;
  output: string;
  deadline: string;
  submit: string;
  submitting: string;
  selected: string;
};

const field =
  "w-full rounded-md border border-rule bg-field px-3 py-2 text-sm transition-colors placeholder:text-muted/70 focus-visible:border-brand";

function Submit({
  disabled,
  label,
  pendingLabel,
}: {
  disabled: boolean;
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={disabled || pending}
      className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 font-medium text-on-brand transition hover:bg-brand-ink active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {pending ? pendingLabel : label}
    </button>
  );
}

export function TaskForm({
  action,
  departments,
  labels,
}: {
  action: (fd: FormData) => Promise<void>;
  departments: Dept[];
  labels: Labels;
}) {
  const [sel, setSel] = useState<Set<string>>(
    () =>
      new Set(
        departments
          .filter((d) => d.badges.length > 0 && !d.already)
          .map((d) => d.id),
      ),
  );
  const toggle = (id: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <form action={action} className="space-y-3">
      {departments.map((d) => {
        const on = sel.has(d.id);
        return (
          <fieldset
            key={d.id}
            disabled={d.already}
            className={`rounded-xl border bg-paper transition-colors ${on ? "border-brand" : "border-rule"} ${d.already ? "opacity-60" : ""}`}
          >
            <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                name="department_id"
                value={d.id}
                checked={on}
                onChange={() => toggle(d.id)}
                className="size-4 accent-[var(--color-brand)]"
              />
              <span className="font-medium">{d.name}</span>
              {!d.already &&
                d.badges.map((b) => (
                  <span
                    key={b}
                    className="inline-flex items-center gap-1 rounded-full bg-mist px-2 py-0.5 text-xs text-brand"
                  >
                    <Sparkles className="size-3" aria-hidden />{" "}
                    {b === "ai" ? labels.suggestedAi : labels.suggestedRule}
                  </span>
                ))}
              {d.already && (
                <span className="text-xs text-muted">{labels.already}</span>
              )}
              {!d.email && (
                <span className="text-xs text-warn">{labels.noEmail}</span>
              )}
            </label>
            {on && d.reason && (
              <p className="-mt-1 px-4 pb-2 pl-11 text-sm text-muted">
                {d.reason}
              </p>
            )}

            <div
              className={`grid transition-[grid-template-rows] duration-200 ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
              <div className="overflow-hidden" inert={!on}>
                <div className="grid gap-3 border-t border-rule px-4 py-4 md:grid-cols-[1fr_180px]">
                  <label className="text-sm md:col-span-2">
                    <span className="mb-1 block text-muted">
                      {labels.scope}
                    </span>
                    <textarea
                      key={d.defaultScope ?? ""}
                      name={`scope_${d.id}`}
                      rows={d.defaultScope ? 4 : 2}
                      defaultValue={d.defaultScope ?? ""}
                      placeholder={labels.scopePh}
                      className={field}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-muted">
                      {labels.output}
                    </span>
                    <input name={`output_${d.id}`} className={field} />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-muted">
                      {labels.deadline}
                    </span>
                    <input
                      name={`deadline_${d.id}`}
                      type="date"
                      className={field}
                    />
                  </label>
                </div>
              </div>
            </div>
          </fieldset>
        );
      })}

      <div className="flex flex-wrap items-center gap-4 pt-2">
        <Submit
          disabled={sel.size === 0}
          label={labels.submit}
          pendingLabel={labels.submitting}
        />
        <span className="text-sm text-muted" aria-live="polite">
          {labels.selected.replace("{n}", String(sel.size))}
        </span>
      </div>
    </form>
  );
}
