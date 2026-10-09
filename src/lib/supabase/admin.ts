import { createClient } from "@supabase/supabase-js";

/** Service-role client. SERVER ONLY — melewati RLS. Jangan di-import dari client component. */
export function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
