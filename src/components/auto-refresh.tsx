"use client";

import { useCallback, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/** Memuat ulang data server tiap 30 detik saat tab terlihat, plus tombol manual. */
export function AutoRefresh({ label, intervalMs = 30_000 }: { label: string; intervalMs?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const refresh = useCallback(() => start(() => router.refresh()), [router]);

  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && refresh(), intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return (
    <button type="button" onClick={refresh} className="inline-flex items-center gap-1.5 rounded-md border border-rule bg-paper px-2.5 py-1.5 text-sm text-muted transition-colors hover:border-brand hover:text-ink">
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
      {label}
    </button>
  );
}
