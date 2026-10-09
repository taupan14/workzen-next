/**
 * Workzen — Phase 4: perakitan runtime (server only) dari environment.
 * Variabel Gmail sama dengan Phase 1–3; tidak ada variabel baru selain scope OAuth tambahan.
 */
import { createClient } from "@supabase/supabase-js";
import { createGoogleGmailPort } from "./gmail-port";
import { createSupabaseMailDb } from "./supabase-mail-db";
import type { DocMailDb, GmailPort } from "./mail-types";

const need = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`ENV_MISSING: ${k}`);
  return v;
};

export function createDocMailRuntime(): { db: DocMailDb; gmail: GmailPort } {
  const sb = createClient(
    process.env.SUPABASE_URL ?? need("NEXT_PUBLIC_SUPABASE_URL"),
    need("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
  const gmail = createGoogleGmailPort({
    clientId: need("GOOGLE_CLIENT_ID"),
    clientSecret: need("GOOGLE_CLIENT_SECRET"),
    refreshToken: need("GOOGLE_REFRESH_TOKEN"),
    mailbox: need("GMAIL_MAILBOX"),
  });
  return { db: createSupabaseMailDb(sb), gmail };
}
