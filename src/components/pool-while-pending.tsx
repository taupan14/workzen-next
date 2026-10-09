"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Muat ulang data server tiap beberapa detik selama analisis berjalan; berhenti setelah ~3 menit. */
export function PollWhilePending({
  ms = 3000,
  max = 60,
}: {
  ms?: number;
  max?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      if (++n > max) return clearInterval(id);
      router.refresh();
    }, ms);
    return () => clearInterval(id);
  }, [router, ms, max]);
  return null;
}
