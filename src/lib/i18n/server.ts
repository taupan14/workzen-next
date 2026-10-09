import { cookies } from "next/headers";
import { dictionaries, type Lang, type Theme } from "./dictionaries";

export async function getLang(): Promise<Lang> {
  return (await cookies()).get("lang")?.value === "en" ? "en" : "id";
}

export async function getTheme(): Promise<Theme> {
  const v = (await cookies()).get("theme")?.value;
  return v === "light" || v === "dark" ? v : "system";
}

export async function getI18n() {
  const lang = await getLang();
  return { lang, t: dictionaries[lang] };
}
