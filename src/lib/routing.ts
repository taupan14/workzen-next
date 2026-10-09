export type RoutingRule = { department_id: string; keywords: string[]; priority: number };

/** Saran departemen berbasis keyword (Phase 1). Hasilnya hanya saran — sales yang memutuskan. */
export function suggestDepartments(text: string, rules: RoutingRule[]): Set<string> {
  const haystack = text.toLowerCase();
  const out = new Set<string>();
  for (const r of [...rules].sort((a, b) => a.priority - b.priority)) {
    if (r.keywords.some((k) => haystack.includes(k.toLowerCase()))) out.add(r.department_id);
  }
  return out;
}
