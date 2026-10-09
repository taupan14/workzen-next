"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Workflow,
} from "lucide-react";

const ICONS = {
  dashboard: LayoutDashboard,
  inquiries: Inbox,
  tasks: ListChecks,
};
type Item = { key: keyof typeof ICONS; href: string; label: string };

export function TopNav(props: {
  items: Item[];
  user: { name: string; role: string };
  labels: { signOut: string; account: string; mainNav: string };
  signOutAction: () => Promise<void>;
  prefs: ReactNode;
  prefsCompact: ReactNode;
}) {
  const { items, user, labels, signOutAction, prefs, prefsCompact } = props;
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials =
    user.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]!.toUpperCase())
      .join("") || "?";

  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5 md:gap-8 md:px-8">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="grid size-7 place-items-center rounded-md bg-brand text-on-brand">
            <Workflow className="size-4" aria-hidden />
          </span>
          <span className="hidden sm:inline text-lg">Workzen</span>
        </Link>

        <nav aria-label={labels.mainNav} className="flex h-full items-stretch">
          {items.map(({ key, href, label }) => {
            const Icon = ICONS[key];
            const active = path === href || path.startsWith(href + "/");
            return (
              <Link
                key={key}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative inline-flex items-center gap-2 px-3 text-sm transition-colors ${active ? "font-medium text-ink" : "text-muted hover:text-ink"}`}
              >
                <Icon className="size-4" aria-hidden />
                {label}
                <span
                  className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand transition-opacity ${active ? "opacity-100" : "opacity-0"}`}
                />
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden md:block">{prefs}</div>
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label={labels.account}
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-full border border-rule bg-field py-1 pl-1 pr-2 transition-colors hover:border-brand"
            >
              <span className="grid size-6 place-items-center rounded-full bg-brand text-[11px] font-semibold text-on-brand">
                {initials}
              </span>
              <ChevronDown
                className={`size-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            {open && (
              <div
                role="menu"
                className="pop absolute right-0 top-full mt-2 w-64 rounded-lg border border-rule bg-paper p-3 shadow-lg"
              >
                <p className="truncate font-medium">{user.name}</p>
                <p className="text-sm text-muted">{user.role}</p>
                <div className="mt-3 border-t border-rule pt-3 md:hidden">
                  {prefsCompact}
                </div>
                <form
                  action={signOutAction}
                  className="mt-3 border-t border-rule pt-2"
                >
                  <button
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded px-2 py-2 text-sm hover:bg-mist"
                  >
                    <LogOut className="size-4" aria-hidden /> {labels.signOut}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
