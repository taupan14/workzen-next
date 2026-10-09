/**
 * Workzen — Phase 4: klien Supabase untuk Server Component / Server Action.
 *  - getUserClient(): memakai helper proyek `serverClient()` (sesi pengguna; RLS + pemeriksaan peran di fungsi SQL berlaku)
 *  - getServiceClient(): service role, HANYA untuk upload/unduh PDF dan signed URL (server only)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverClient } from "@/lib/supabase/server";

const need = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`ENV_MISSING: ${k}`);
  return v;
};

export async function getUserClient(): Promise<SupabaseClient> {
  return (await serverClient()) as SupabaseClient;
}

export function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL ?? need("NEXT_PUBLIC_SUPABASE_URL"),
    need("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false },
    },
  );
}
