/**
 * Workzen — Phase 4: klien Supabase untuk Server Component / Server Action.
 *  - getUserClient(): helper proyek serverClient() (sesi pengguna; RLS + pemeriksaan peran di fungsi SQL berlaku)
 *  - getServiceClient(): adminClient() proyek (service role) — HANYA untuk upload/unduh PDF dan signed URL
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";

export async function getUserClient(): Promise<SupabaseClient> {
  return (await serverClient()) as SupabaseClient;
}

export function getServiceClient(): SupabaseClient {
  return adminClient() as SupabaseClient;
}
