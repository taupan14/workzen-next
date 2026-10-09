import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { getLang } from "@/lib/i18n/server";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: "Workzen",
  description: "Email → structured business workflow",
};

// Berjalan sebelum paint: menerapkan tema dari cookie (atau OS) tanpa kedip.
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|; )theme=([^;]+)/);var t=m?m[1]:'system';if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
