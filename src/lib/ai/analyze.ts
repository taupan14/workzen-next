import type { AnalysisContext } from "./context";
import { confidenceThreshold } from "./config";
import {
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  buildUserPrompt,
  renderAttachments,
  renderThread,
} from "./prompt";
import { getProvider } from "./provider";
import {
  ANALYSIS_JSON_SCHEMA,
  AnalysisOutput,
  REQUIRED_KEYS,
  STANDARD_FIELDS,
  standardLabel,
  type AnalysisOutputT,
} from "./schema";

export type ModelResult = {
  output: AnalysisOutputT;
  model: string;
  provider: string;
  usage: { input_tokens: number; output_tokens: number };
};

/** Panggil model dan validasi bentuk outputnya. Output tidak valid dilempar sebagai error biasa agar di-retry. */
export async function callModel(ctx: AnalysisContext): Promise<ModelResult> {
  const provider = await getProvider();
  const res = await provider.call({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(ctx),
    toolName: "record_analysis",
    toolDescription: "Record the structured analysis of the customer email.",
    inputSchema: ANALYSIS_JSON_SCHEMA as unknown as Record<string, unknown>,
  });
  const parsed = AnalysisOutput.safeParse(res.output);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `Output model tidak valid: ${issue?.path.join(".")} ${issue?.message}`,
    );
  }
  return {
    output: parsed.data,
    model: res.model,
    provider: provider.name,
    usage: res.usage,
  };
}

// ---------- pasca-pemrosesan: verifikasi kutipan, keyakinan, antrean review ----------
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Kutipan valid hanya bila benar-benar ada di teks email yang dilihat model. */
export function verifyQuote(
  quote: string | null | undefined,
  haystack: string,
): boolean {
  if (!quote) return false;
  const q = normalize(quote);
  return q.length >= 3 && normalize(haystack).includes(q);
}

export type SaveItem = {
  kind: "FIELD" | "REQUIREMENT";
  key: string;
  label: string;
  value: string | null;
  unit: string | null;
  department_code: string | null;
  confidence: number | null;
  source_text: string | null;
  source_verified: boolean | null;
  is_missing: boolean;
  question: string | null;
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (n: number) => Math.min(1, Math.max(0, n));

export function buildSavePayload(args: {
  ctx: AnalysisContext;
  result: ModelResult;
  runKey: string;
  threshold?: number;
}) {
  const { ctx, result, runKey } = args;
  const threshold = args.threshold ?? confidenceThreshold();
  const o = result.output;
  const haystack = `${renderThread(ctx.messages)}\n${renderAttachments(ctx.attachments)}`;
  const validCodes = new Set(ctx.departments.map((d) => d.code));
  const questions = new Map(o.missing_information.map((m) => [m.key, m]));

  const scored = (confidence: number, quote: string | null) => {
    const verified = verifyQuote(quote, haystack);
    // Nilai tanpa kutipan yang terbukti ada di email tidak boleh tampil "yakin".
    return {
      verified,
      confidence: round3(
        clamp(verified ? confidence : Math.min(confidence, 0.5)),
      ),
    };
  };

  const fields: SaveItem[] = [];
  const seen = new Set<string>();
  for (const f of o.fields) {
    if (seen.has(f.key)) continue;
    seen.add(f.key);
    const label = standardLabel(f.key) ?? f.label;
    const value = f.value?.trim() ? f.value.trim() : null;
    if (value === null) {
      fields.push({
        kind: "FIELD",
        key: f.key,
        label,
        value: null,
        unit: null,
        department_code: null,
        confidence: null,
        source_text: null,
        source_verified: null,
        is_missing: true,
        question: questions.get(f.key)?.question ?? null,
      });
      continue;
    }
    const s = scored(f.confidence, f.source_quote);
    fields.push({
      kind: "FIELD",
      key: f.key,
      label,
      value,
      unit: f.unit?.trim() || null,
      department_code: null,
      confidence: s.confidence,
      source_text: f.source_quote,
      source_verified: s.verified,
      is_missing: false,
      question: null,
    });
  }
  // Informasi kurang yang disebut model tapi belum jadi field; plus field wajib yang tidak muncul sama sekali.
  const addMissing = (key: string, label: string, question: string | null) => {
    if (seen.has(key)) return;
    seen.add(key);
    fields.push({
      kind: "FIELD",
      key,
      label,
      value: null,
      unit: null,
      department_code: null,
      confidence: null,
      source_text: null,
      source_verified: null,
      is_missing: true,
      question,
    });
  };
  for (const m of o.missing_information)
    addMissing(m.key, standardLabel(m.key) ?? m.label, m.question);
  for (const key of REQUIRED_KEYS) addMissing(key, standardLabel(key)!, null);

  const order = new Map(STANDARD_FIELDS.map((f, i) => [f.key as string, i]));
  fields.sort(
    (a, b) =>
      Number(a.is_missing) - Number(b.is_missing) ||
      (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99),
  );

  const requirements: SaveItem[] = o.requirements.map((r, i) => {
    const s = scored(r.confidence, r.source_quote);
    const code = r.department_code?.trim().toUpperCase() ?? null;
    return {
      kind: "REQUIREMENT",
      key: `req_${i + 1}`,
      label: r.title,
      value: r.description,
      unit: null,
      department_code: code && validCodes.has(code) ? code : null,
      confidence: s.confidence,
      source_text: r.source_quote,
      source_verified: s.verified,
      is_missing: false,
      question: null,
    };
  });

  // Routing: hanya departemen yang ada di master; AI tidak boleh membuat departemen baru.
  const routing: {
    department_code: string;
    reason: string;
    confidence: number;
  }[] = [];
  for (const r of o.routing) {
    const code = r.department_code.trim().toUpperCase();
    if (
      validCodes.has(code) &&
      !routing.some((x) => x.department_code === code)
    ) {
      routing.push({
        department_code: code,
        reason: r.reason,
        confidence: round3(clamp(r.confidence)),
      });
    }
  }

  const items = [...fields, ...requirements];
  const present = fields.filter((f) => !f.is_missing && f.confidence !== null);
  const overall = present.length
    ? round3(
        present.reduce((n, f) => n + (f.confidence ?? 0), 0) / present.length,
      )
    : null;

  const needsReview =
    o.classification !== "INQUIRY" ||
    o.classification_confidence < threshold ||
    items.some((i) => !i.is_missing && (i.confidence ?? 0) < threshold) ||
    items.some((i) => !i.is_missing && i.source_verified === false) ||
    fields.some((f) => f.is_missing && REQUIRED_KEYS.includes(f.key));

  return {
    inquiry_id: ctx.inquiry_id,
    email_message_id: ctx.email_message_id,
    run_key: runKey,
    prompt_version: PROMPT_VERSION,
    provider: result.provider,
    model: result.model,
    classification: o.classification,
    classification_confidence: round3(clamp(o.classification_confidence)),
    language: o.language,
    summary: o.summary,
    overall_confidence: overall,
    needs_review: needsReview,
    routing,
    usage: result.usage,
    items: items.map((i, idx) => ({ ...i, sort_order: idx })),
  };
}
