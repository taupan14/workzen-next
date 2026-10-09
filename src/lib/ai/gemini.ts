import {
  LLMError,
  type LLMProvider,
  type LLMRequest,
  type LLMResponse,
} from "./provider";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * JSON Schema -> subset OpenAPI yang diterima Gemini (responseSchema):
 * tipe berbentuk daftar ["string","null"] menjadi type + nullable, dan kata kunci
 * yang tidak didukung dibuang (validasi tetap dilakukan zod di sisi kita).
 */
export function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "type" && Array.isArray(v)) {
      const types = v.filter((t) => t !== "null");
      out.type = types[0] ?? "string";
      if (v.includes("null")) out.nullable = true;
    } else if (
      k === "minimum" ||
      k === "maximum" ||
      k === "additionalProperties"
    ) {
      continue;
    } else if (k === "properties" && v && typeof v === "object") {
      out.properties = Object.fromEntries(
        Object.entries(v as object).map(([pk, pv]) => [pk, toGeminiSchema(pv)]),
      );
    } else {
      out[k] = toGeminiSchema(v);
    }
  }
  return out;
}

function apiMessage(text: string): string {
  try {
    const m = JSON.parse(text)?.error?.message;
    if (typeof m === "string") return m.slice(0, 300);
  } catch {
    /* bukan JSON */
  }
  return text.slice(0, 300);
}

export function geminiProvider(): LLMProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    throw new LLMError(
      "GEMINI_API_KEY belum diisi di environment server",
      false,
    );
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";

  return {
    name: "gemini",
    async call(req: LLMRequest): Promise<LLMResponse> {
      const res = await fetch(
        `${BASE}/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: [{ role: "user", parts: [{ text: req.user }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: toGeminiSchema(req.inputSchema),
              maxOutputTokens: req.maxTokens ?? 8192,
            },
          }),
          signal: AbortSignal.timeout(90_000),
        },
      );

      if (!res.ok) {
        const msg = apiMessage(await res.text().catch(() => ""));
        // 429 = kuota/RPM habis; 5xx = gangguan sementara. 400/401/403/404 = kunci, wilayah, atau model salah.
        const retryable = res.status === 429 || res.status >= 500;
        throw new LLMError(
          `Gemini ${res.status}: ${msg}`,
          retryable,
          res.status,
        );
      }

      const json: any = await res.json();
      const blocked = json.promptFeedback?.blockReason;
      if (blocked)
        throw new LLMError(`Diblokir oleh filter Google (${blocked})`, false);

      const cand = json.candidates?.[0];
      if (!cand)
        throw new LLMError("Gemini tidak mengembalikan kandidat jawaban", true);
      if (
        cand.finishReason &&
        ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"].includes(
          cand.finishReason,
        )
      ) {
        throw new LLMError(
          `Jawaban diblokir oleh filter Google (${cand.finishReason})`,
          false,
        );
      }

      const text = (cand.content?.parts ?? [])
        .filter((p: any) => typeof p.text === "string" && !p.thought)
        .map((p: any) => p.text)
        .join("");
      let output: unknown;
      try {
        output = JSON.parse(text);
      } catch {
        const why =
          cand.finishReason === "MAX_TOKENS"
            ? "jawaban terpotong (MAX_TOKENS)"
            : "bukan JSON valid";
        throw new LLMError(`Respons Gemini ${why}`, true);
      }

      const u = json.usageMetadata ?? {};
      return {
        output,
        model: json.modelVersion ?? model,
        usage: {
          input_tokens: u.promptTokenCount ?? 0,
          output_tokens:
            (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
        },
      };
    },
  };
}
