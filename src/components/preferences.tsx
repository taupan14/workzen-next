"use client";

import { useEffect, useState, useTransition } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { setLang, setTheme } from "@/lib/i18n/actions";
import type { Lang, Theme } from "@/lib/i18n/dictionaries";

type Labels = { language: string; theme: string; light: string; dark: string; system: string };

const prefersDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
const applyTheme = (t: Theme) => {
  document.documentElement.dataset.theme = t === "system" ? (prefersDark() ? "dark" : "light") : t;
};

const seg = "inline-flex items-center rounded-md border border-rule bg-field p-0.5";
const btn = (on: boolean) =>
  `inline-flex h-7 min-w-8 items-center justify-center rounded px-2 text-xs font-medium transition-colors ${
    on ? "bg-brand text-on-brand" : "text-muted hover:text-ink"
  }`;

export function Preferences({ lang, theme, labels }: { lang: Lang; theme: Theme; labels: Labels }) {
  const [, start] = useTransition();
  const [curLang, setCurLang] = useState(lang);
  const [curTheme, setCurTheme] = useState(theme);

  useEffect(() => setCurLang(lang), [lang]);
  useEffect(() => setCurTheme(theme), [theme]);

  // Mode "ikuti sistem": ikut berubah saat OS berganti tema.
  useEffect(() => {
    if (curTheme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [curTheme]);

  const pickTheme = (t: Theme) => {
    setCurTheme(t);
    applyTheme(t); // instan, tanpa menunggu server
    start(() => setTheme(t));
  };
  const pickLang = (l: Lang) => {
    setCurLang(l);
    start(() => setLang(l));
  };

  const themes: { key: Theme; label: string; Icon: typeof Sun }[] = [
    { key: "light", label: labels.light, Icon: Sun },
    { key: "system", label: labels.system, Icon: Monitor },
    { key: "dark", label: labels.dark, Icon: Moon },
  ];

  return (
    <div className="flex items-center gap-2">
      <div role="group" aria-label={labels.language} className={seg}>
        {(["id", "en"] as Lang[]).map((l) => (
          <button key={l} type="button" aria-pressed={curLang === l} onClick={() => pickLang(l)} className={btn(curLang === l)}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <div role="group" aria-label={labels.theme} className={seg}>
        {themes.map(({ key, label, Icon }) => (
          <button key={key} type="button" aria-pressed={curTheme === key} aria-label={label} title={label} onClick={() => pickTheme(key)} className={btn(curTheme === key)}>
            <Icon className="size-4" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}
