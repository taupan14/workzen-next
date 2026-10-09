import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { getI18n, getTheme } from "@/lib/i18n/server";
import { TopNav } from "@/components/top-nav";
import { Preferences } from "@/components/preferences";

async function signOut() {
  "use server";
  const supabase = await serverClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,role")
    .eq("id", user.id)
    .single();

  const { lang, t } = await getI18n();
  const theme = await getTheme();
  const prefLabels = {
    language: t.nav.language,
    theme: t.nav.theme,
    light: t.nav.themeLight,
    dark: t.nav.themeDark,
    system: t.nav.themeSystem,
  };

  return (
    <>
      <TopNav
        items={
          profile?.role === "dept_user"
            ? [{ key: "tasks", href: "/tasks", label: t.nav.tasks }]
            : [
                {
                  key: "dashboard",
                  href: "/dashboard",
                  label: t.nav.dashboard,
                },
                {
                  key: "inquiries",
                  href: "/inquiries",
                  label: t.nav.inquiries,
                },
                { key: "tasks", href: "/tasks", label: t.nav.tasks },
                {
                  key: "documents",
                  href: "/documents",
                  label: t.nav.documents,
                },
              ]
        }
        user={{
          name: profile?.full_name ?? user.email ?? "",
          role: t.roles[profile?.role ?? ""] ?? "",
        }}
        labels={{
          signOut: t.nav.signOut,
          account: t.nav.account,
          mainNav: t.nav.mainNav,
        }}
        signOutAction={signOut}
        prefs={<Preferences lang={lang} theme={theme} labels={prefLabels} />}
        prefsCompact={
          <Preferences lang={lang} theme={theme} labels={prefLabels} />
        }
      />
      <main className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
        {children}
      </main>
    </>
  );
}
