import { redirect } from "next/navigation";
import { Workflow } from "lucide-react";
import { serverClient } from "@/lib/supabase/server";
import { getI18n, getTheme } from "@/lib/i18n/server";
import { Preferences } from "@/components/preferences";

async function signIn(formData: FormData) {
  "use server";
  const supabase = await serverClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (error) redirect("/login?error=1");
  redirect("/dashboard");
}

const field = "mt-1 w-full rounded-md border border-rule bg-field px-3 py-2 transition-colors focus-visible:border-brand";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { lang, t } = await getI18n();
  const theme = await getTheme();

  return (
    <main className="min-h-screen px-4">
      <div className="mx-auto flex max-w-6xl justify-end py-4">
        <Preferences lang={lang} theme={theme} labels={{ language: t.nav.language, theme: t.nav.theme, light: t.nav.themeLight, dark: t.nav.themeDark, system: t.nav.themeSystem }} />
      </div>
      <div className="grid place-items-center pt-[12vh]">
        <form action={signIn} className="w-full max-w-sm space-y-5 rounded-xl border border-rule bg-paper p-8 shadow-sm">
          <div>
            <span className="grid size-10 place-items-center rounded-lg bg-brand text-on-brand"><Workflow className="size-5" aria-hidden /></span>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">Workzen</h1>
            <p className="mt-1 text-sm text-muted">{t.login.subtitle}</p>
          </div>
          {error && <p role="alert" className="rounded-md border-l-4 border-danger bg-mist px-3 py-2 text-sm text-danger">{t.login.error}</p>}
          <label className="block text-sm font-medium">
            {t.login.email}
            <input name="email" type="email" required autoComplete="email" className={field} />
          </label>
          <label className="block text-sm font-medium">
            {t.login.password}
            <input name="password" type="password" required autoComplete="current-password" className={field} />
          </label>
          <button className="w-full rounded-md bg-brand py-2.5 font-medium text-on-brand transition hover:bg-brand-ink active:scale-[.98]">{t.login.submit}</button>
        </form>
      </div>
    </main>
  );
}
