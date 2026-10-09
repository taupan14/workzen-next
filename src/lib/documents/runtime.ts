/**
 * Workzen — Phase 4: perakitan runtime email dokumen (server only), memakai helper proyek:
 * adminClient() untuk database/storage dan klien Gmail Phase 1–3 (@/lib/gmail/client).
 */
import { adminClient } from "@/lib/supabase/admin";
import { createGmailPort } from "./gmail-port";
import { createSupabaseMailDb } from "./supabase-mail-db";
import type { DocMailDb, GmailPort } from "./mail-types";

export function createDocMailRuntime(): { db: DocMailDb; gmail: GmailPort } {
  return { db: createSupabaseMailDb(adminClient()), gmail: createGmailPort() };
}
