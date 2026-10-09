"use server";
/**
 * Workzen — Phase 4: Server Actions untuk costing & dokumen.
 * Semua perubahan data memakai klien pengguna (RLS + pemeriksaan peran di fungsi SQL tetap berlaku).
 * Service role hanya dipakai untuk upload/unduh PDF (lib/documents/generate-pdf.ts).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireManager } from "@/lib/documents/auth";
import { friendlyError } from "@/lib/documents/readiness-messages";
import { generateAndAttachPdf } from "@/lib/documents/generate-pdf";
import { notifyEmailQueued } from "@/lib/documents/events";
import { getServiceClient } from "@/lib/documents/supabase";

type Ctx = { sb: SupabaseClient; userId: string };

/** Jalankan aksi lalu redirect dengan ?msg= / ?err= (redirect() melempar, jadi dilakukan di luar try). */
async function run(
  returnPath: string,
  fn: (c: Ctx) => Promise<string | { to: string; msg: string }>,
): Promise<never> {
  let target: string;
  try {
    const { sb, userId } = await requireManager();
    const r = await fn({ sb, userId });
    const base = typeof r === "string" ? returnPath : r.to;
    const msg = typeof r === "string" ? r : r.msg;
    revalidatePath(returnPath);
    revalidatePath(base);
    target = `${base}?msg=${encodeURIComponent(msg)}`;
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    target = `${returnPath}?err=${encodeURIComponent(friendlyError(raw))}`;
  }
  redirect(target);
}

const str = (fd: FormData, k: string): string | null => {
  const v = fd.get(k);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};
const need = (fd: FormData, k: string): string => {
  const v = str(fd, k);
  if (!v) throw new Error(`Kolom "${k}" wajib diisi.`);
  return v;
};
const numOrNull = (fd: FormData, k: string): number | null => {
  const v = str(fd, k);
  if (v == null) return null;
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`Kolom "${k}" harus berupa angka.`);
  return n;
};
const check = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

async function recalc(sb: SupabaseClient, scenarioId: string) {
  check((await sb.rpc("recalc_scenario", { p_scenario: scenarioId })).error);
}

// ---------------------------------------------------------------- skenario
export async function createScenario(fd: FormData) {
  const inquiryId = need(fd, "inquiry_id");
  const back = `/inquiries/${inquiryId}/costing`;
  await run(back, async ({ sb, userId }) => {
    const usd = numOrNull(fd, "usd_rate");
    const { error } = await sb.from("cost_scenarios").insert({
      inquiry_id: inquiryId,
      code: need(fd, "code").toUpperCase(),
      name: need(fd, "name"),
      location: str(fd, "location"),
      fx_rates: usd ? { USD: usd } : {},
      fx_source: usd ? (str(fd, "fx_source") ?? "manual") : null,
      fx_date: usd ? new Date().toISOString().slice(0, 10) : null,
      created_by: userId,
    });
    check(error);
    return "Skenario dibuat.";
  });
}

const HEADER_KEYS = [
  "principal",
  "billing_address",
  "vessel_name",
  "dwt",
  "grt_nrt",
  "loa_breadth",
  "port_of_call",
  "purpose_of_call",
  "activity",
  "cargo",
  "eta",
] as const;

export async function saveScenarioHeader(fd: FormData) {
  const scenarioId = need(fd, "scenario_id");
  const back = `/inquiries/${need(fd, "inquiry_id")}/costing`;
  await run(back, async ({ sb }) => {
    const header: Record<string, string> = {};
    for (const k of HEADER_KEYS) {
      const v = str(fd, k);
      if (v) header[k] = v;
    }
    const usd = numOrNull(fd, "usd_rate");
    const { error } = await sb
      .from("cost_scenarios")
      .update({
        header,
        name: need(fd, "name"),
        location: str(fd, "location"),
        fx_rates: usd ? { USD: usd } : {},
        fx_source: usd ? (str(fd, "fx_source") ?? "manual") : null,
        fx_date: usd ? new Date().toISOString().slice(0, 10) : null,
      })
      .eq("id", scenarioId);
    check(error);
    await recalc(sb, scenarioId);
    return "Data skenario disimpan (dokumen lama yang belum terkirim dibatalkan bila kurs berubah).";
  });
}

export async function assignTaskScenario(fd: FormData) {
  const back = `/inquiries/${need(fd, "inquiry_id")}/costing`;
  await run(back, async ({ sb }) => {
    const { error } = await sb
      .from("tasks")
      .update({ scenario_id: str(fd, "scenario_id") })
      .eq("id", need(fd, "task_id"));
    check(error);
    return "Task dikaitkan ke skenario.";
  });
}

// ---------------------------------------------------------------- baris biaya
export async function saveLine(fd: FormData) {
  const inquiryId = need(fd, "inquiry_id");
  const scenarioId = need(fd, "scenario_id");
  const id = str(fd, "id");
  await run(`/inquiries/${inquiryId}/costing`, async ({ sb, userId }) => {
    const formula = str(fd, "formula") ?? "QTY_RATE";
    const requirement = str(fd, "requirement_status") ?? "PENDING";
    const row = {
      section_code: str(fd, "section_code") ?? "UNSORTED",
      sort_order: numOrNull(fd, "sort_order") ?? 0,
      description: need(fd, "description"),
      vendor: str(fd, "vendor"),
      formula,
      qty: numOrNull(fd, "qty"),
      uom: str(fd, "uom"),
      qty2: numOrNull(fd, "qty2") ?? 1,
      uom2: str(fd, "uom2"),
      cost_rate: numOrNull(fd, "cost_rate"),
      currency: (str(fd, "currency") ?? "IDR").toUpperCase(),
      margin_pct: numOrNull(fd, "margin_pct") ?? 0,
      discount_pct: numOrNull(fd, "discount_pct") ?? 0,
      sell_rate_override: numOrNull(fd, "sell_rate_override"),
      percent_value:
        formula === "PERCENT_OF_LINE" ? numOrNull(fd, "percent_value") : null,
      parent_line_id:
        formula === "PERCENT_OF_LINE" ? str(fd, "parent_line_id") : null,
      treatment: str(fd, "treatment") ?? "CONFIRMED",
      requirement_status: requirement,
      exception_note: str(fd, "exception_note"),
      validity_until: str(fd, "validity_until"),
      condition_text: str(fd, "condition_text"),
      remark: str(fd, "remark"),
      internal_note: str(fd, "internal_note"),
      verified_by: requirement === "PENDING" ? null : userId,
      verified_at: requirement === "PENDING" ? null : new Date().toISOString(),
    };
    if (requirement === "EXCEPTION" && !row.exception_note)
      throw new Error("EXCEPTION_NOTE_REQUIRED");
    if (id) check((await sb.from("cost_lines").update(row).eq("id", id)).error);
    else
      check(
        (
          await sb
            .from("cost_lines")
            .insert({ ...row, inquiry_id: inquiryId, scenario_id: scenarioId })
            .select("id")
            .single()
        ).error,
      );
    await recalc(sb, scenarioId);
    return id ? "Baris disimpan." : "Baris ditambahkan.";
  });
}

export async function deleteLine(fd: FormData) {
  const scenarioId = need(fd, "scenario_id");
  await run(`/inquiries/${need(fd, "inquiry_id")}/costing`, async ({ sb }) => {
    check(
      (await sb.from("cost_lines").delete().eq("id", need(fd, "id"))).error,
    );
    await recalc(sb, scenarioId);
    return "Baris dihapus.";
  });
}

export async function importFromTasks(fd: FormData) {
  const scenarioId = need(fd, "scenario_id");
  await run(`/inquiries/${need(fd, "inquiry_id")}/costing`, async ({ sb }) => {
    const { data, error } = await sb.rpc("import_cost_lines_from_tasks", {
      p_scenario: scenarioId,
    });
    check(error);
    await recalc(sb, scenarioId);
    return `${data ?? 0} baris biaya diimpor dari task (status Pending, belum masuk bagian dokumen).`;
  });
}

/** Sahkan sekaligus semua baris Pending yang datanya valid dan bukan Estimate. */
export async function confirmValidLines(fd: FormData) {
  const scenarioId = need(fd, "scenario_id");
  await run(`/inquiries/${need(fd, "inquiry_id")}/costing`, async ({ sb }) => {
    await recalc(sb, scenarioId);
    const { data, error } = await sb
      .from("cost_lines")
      .select("id, treatment, calc_issues, requirement_status")
      .eq("scenario_id", scenarioId)
      .eq("requirement_status", "PENDING");
    check(error);
    const ids = (data ?? [])
      .filter(
        (l) => l.treatment !== "ESTIMATE" && (l.calc_issues ?? []).length === 0,
      )
      .map((l) => l.id as string);
    if (ids.length === 0)
      return "Tidak ada baris Pending yang valid untuk disahkan.";
    const r = await sb.rpc("confirm_cost_lines", {
      p_line_ids: ids,
      p_status: "CONFIRMED",
      p_note: null,
    });
    check(r.error);
    await recalc(sb, scenarioId);
    return `${ids.length} baris disahkan (Confirmed).`;
  });
}

export async function recalcScenario(fd: FormData) {
  const scenarioId = need(fd, "scenario_id");
  await run(`/inquiries/${need(fd, "inquiry_id")}/costing`, async ({ sb }) => {
    await recalc(sb, scenarioId);
    return "Perhitungan diperbarui.";
  });
}

// ---------------------------------------------------------------- dokumen
async function renderPdf(documentId: string) {
  return generateAndAttachPdf(getServiceClient(), documentId);
}

export async function compileDoc(fd: FormData) {
  const inquiryId = need(fd, "inquiry_id");
  const docType = need(fd, "doc_type");
  await run(`/inquiries/${inquiryId}/costing`, async ({ sb, userId }) => {
    const { data, error } = await sb.rpc("compile_document", {
      p_scenario: need(fd, "scenario_id"),
      p_doc_type: docType,
      p_actor: userId,
    });
    check(error);
    const docId = data as string;
    let msg = `${docType === "QUO" ? "Quotation" : "EPDA"} dibuat.`;
    try {
      await renderPdf(docId);
      msg += " PDF siap.";
    } catch (e) {
      msg += ` PDF belum berhasil dibuat (${friendlyError(e instanceof Error ? e.message : String(e))}); coba lagi dari halaman dokumen.`;
    }
    return { to: `/documents/${docId}`, msg };
  });
}

export async function generatePdf(fd: FormData) {
  const id = need(fd, "document_id");
  await run(`/documents/${id}`, async () => {
    await renderPdf(id);
    return "PDF dibuat ulang.";
  });
}

export async function requestApproval(fd: FormData) {
  const id = need(fd, "document_id");
  await run(`/documents/${id}`, async ({ sb, userId }) => {
    const { data, error } = await sb.rpc("request_document_approval", {
      p_document: id,
      p_actor: userId,
    });
    check(error);
    await notifyEmailQueued(id);
    return `Permintaan approval diantrekan ke ${data ?? 0} approver.`;
  });
}

export async function createDraft(fd: FormData) {
  const id = need(fd, "document_id");
  await run(`/documents/${id}`, async ({ sb, userId }) => {
    const cc = (str(fd, "cc") ?? "").split(/[,;\s]+/).filter(Boolean);
    const { error } = await sb.rpc("create_customer_draft", {
      p_document: id,
      p_to_email: need(fd, "to_email"),
      p_cc: cc,
      p_actor: userId,
    });
    check(error);
    await notifyEmailQueued(id);
    return "Draft email customer diantrekan. Buka Gmail, periksa, lalu kirim dari sana.";
  });
}
