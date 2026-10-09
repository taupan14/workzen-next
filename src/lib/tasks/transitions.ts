export const STATUSES = [
  "ASSIGNED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "BLOCKED",
  "SUBMITTED",
  "VERIFIED",
  "CANCELLED",
] as const;
export type TaskStatus = (typeof STATUSES)[number];
export type Role = "admin" | "coo" | "sales_lead" | "sales" | "dept_user";

// Cerminan matriks di fungsi SQL set_task_status (0006). Perubahan harus dilakukan di kedua tempat;
// tes konsistensi memeriksa keduanya.
const NEXT: Record<string, TaskStatus[]> = {
  ASSIGNED: ["ACKNOWLEDGED", "IN_PROGRESS", "BLOCKED", "CANCELLED"],
  ACKNOWLEDGED: ["IN_PROGRESS", "BLOCKED", "SUBMITTED", "CANCELLED"],
  IN_PROGRESS: ["BLOCKED", "SUBMITTED", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "SUBMITTED", "CANCELLED"],
  SUBMITTED: ["VERIFIED", "IN_PROGRESS", "CANCELLED"],
};
const DEPT_TARGETS: TaskStatus[] = [
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "BLOCKED",
  "SUBMITTED",
];
const STAFF: Role[] = ["admin", "sales_lead", "sales"];

export const isStaff = (role: string | null | undefined): boolean =>
  STAFF.includes(role as Role);

export function allowedTransitions(
  role: string | null | undefined,
  from: string,
): TaskStatus[] {
  const base = NEXT[from] ?? [];
  if (isStaff(role)) return base;
  if (role === "dept_user")
    return from === "SUBMITTED"
      ? []
      : base.filter((t) => DEPT_TARGETS.includes(t));
  return [];
}

/** Masukan tambahan yang diminta tindakan tertentu. */
export type Needs =
  | "blocker"
  | "note-required"
  | "note-optional"
  | "confirm"
  | null;
export function needsFor(from: string, to: string): Needs {
  if (to === "BLOCKED") return "blocker";
  if (from === "SUBMITTED" && to === "IN_PROGRESS") return "note-required";
  if (to === "CANCELLED") return "confirm";
  if (to === "SUBMITTED" || to === "VERIFIED") return "note-optional";
  return null;
}
