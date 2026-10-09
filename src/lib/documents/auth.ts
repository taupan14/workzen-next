/**
 * Workzen — Phase 4: pemeriksaan peran untuk halaman dan aksi dokumen.
 * Pemeriksaan di sini hanya untuk UX; penegakan sebenarnya ada di RLS dan fungsi SQL (p4_assert_*).
 */
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserClient } from "./supabase";

export type AppRole = "admin" | "coo" | "sales_lead" | "sales" | "dept_user";
export const STAFF_ROLES: AppRole[] = ["admin", "coo", "sales_lead", "sales"];
export const MANAGER_ROLES: AppRole[] = ["admin", "sales_lead", "sales"];

export interface Session {
  sb: SupabaseClient;
  userId: string;
  role: AppRole;
  canManage: boolean;
}

export async function requireStaff(): Promise<Session> {
  const sb = await getUserClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: prof } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = (prof?.role ?? "dept_user") as AppRole;
  // Akun departemen tidak punya halaman costing/dokumen; arahkan ke daftar task (sama seperti dashboard).
  if (!STAFF_ROLES.includes(role)) redirect("/tasks");
  return { sb, userId: user.id, role, canManage: MANAGER_ROLES.includes(role) };
}

export async function requireManager(): Promise<Session> {
  const s = await requireStaff();
  if (!s.canManage)
    throw new Error("FORBIDDEN: butuh peran sales, sales lead atau admin");
  return s;
}
