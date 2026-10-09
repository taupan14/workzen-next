/**
 * Workzen — Phase 4: memuat data dokumen untuk dirender.
 * SENGAJA hanya membaca `documents` dan `document_lines` (customer-facing).
 * `document_internal` (cost, margin, vendor) tidak pernah disentuh oleh jalur PDF/email customer.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentPdfInput, PdfLine, Treatment } from "./render-pdf";

export interface LoadedDocument {
  input: DocumentPdfInput;
  meta: {
    id: string;
    inquiryId: string;
    docType: "EPDA" | "QUO";
    docSeq: number;
    version: number;
    status: string;
    pdfStoragePath: string | null;
  };
}

const n = (v: unknown): number | null => (v == null ? null : Number(v));

export async function loadDocumentForRender(
  sb: SupabaseClient,
  documentId: string,
): Promise<LoadedDocument> {
  const { data: d, error } = await sb
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single();
  if (error || !d)
    throw new Error(`DOC_NOT_FOUND: ${error?.message ?? documentId}`);

  const [{ data: rows, error: e2 }, { data: tpl }] = await Promise.all([
    sb
      .from("document_lines")
      .select("*")
      .eq("document_id", documentId)
      .order("sort_order"),
    d.template_id
      ? sb
          .from("document_templates")
          .select("config")
          .eq("id", d.template_id)
          .single()
      : Promise.resolve({ data: null }),
  ]);
  if (e2) throw new Error(`LINES_LOAD_FAILED: ${e2.message}`);

  const lines: PdfLine[] = (rows ?? []).map((r) => ({
    sectionLabel: r.section_label as string | null,
    description: r.description as string,
    qty: n(r.qty),
    uom: r.uom as string | null,
    qty2: n(r.qty2),
    uom2: r.uom2 as string | null,
    unitPriceIdr: n(r.unit_price_idr),
    discountPct: n(r.discount_pct),
    amountIdr: n(r.amount_idr),
    treatment: r.treatment as Treatment,
    remark: r.remark as string | null,
  }));

  const cfg = (tpl?.config ?? {}) as {
    title?: string;
    signature?: { closing?: string; name?: string; title?: string };
  };
  const fx = (d.fx_snapshot?.rates ?? null) as Record<string, number> | null;

  return {
    input: {
      docType: d.doc_type,
      docNo: d.doc_no,
      docDate: d.doc_date,
      validUntil: d.valid_until,
      customerName: d.customer_name,
      customerEmail: d.customer_email,
      header: d.header ?? {},
      lines,
      subtotalIdr: Number(d.subtotal_idr),
      taxAmountIdr: n(d.tax_amount_idr),
      totalIdr: Number(d.total_idr),
      conditionalIdr: n(d.conditional_idr),
      fxRates: fx && Object.keys(fx).length ? fx : null,
      terms: d.terms ?? {},
      title: cfg.title,
      signature: cfg.signature,
    },
    meta: {
      id: d.id,
      inquiryId: d.inquiry_id,
      docType: d.doc_type,
      docSeq: d.doc_seq,
      version: d.version,
      status: d.status,
      pdfStoragePath: d.pdf_storage_path,
    },
  };
}
