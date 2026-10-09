"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

const opts = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };

export async function setLang(lang: string) {
  if (lang !== "id" && lang !== "en") return;
  (await cookies()).set("lang", lang, opts);
  revalidatePath("/", "layout");
}

export async function setTheme(theme: string) {
  if (!["light", "dark", "system"].includes(theme)) return;
  (await cookies()).set("theme", theme, opts);
}
