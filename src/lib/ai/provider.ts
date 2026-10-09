export class LLMError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
    public status?: number,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

/** Kesalahan permanen (kunci/model/wilayah salah, konten diblokir): mengulang tidak membantu. */
export const isPermanentLLMError = (e: unknown): boolean =>
  !!e &&
  typeof e === "object" &&
  (e as { name?: string }).name === "LLMError" &&
  (e as { retryable?: boolean }).retryable === false;

export type LLMRequest = {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
  maxTokens?: number;
};
export type LLMResponse = {
  output: unknown;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
};
export interface LLMProvider {
  name: string;
  call(req: LLMRequest): Promise<LLMResponse>;
}

/**
 * Provider dipilih lewat AI_PROVIDER. Bila kosong: Gemini jika GEMINI_API_KEY ada,
 * lalu Anthropic jika ANTHROPIC_API_KEY ada, selain itu Gemini (paket gratis).
 */
export function resolveProviderName(): string {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (explicit) return explicit;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "gemini";
}

/** Menambah provider baru = satu file yang mengimplementasikan LLMProvider + satu baris di sini. */
export async function getProvider(): Promise<LLMProvider> {
  const name = resolveProviderName();
  if (name === "gemini") return (await import("./gemini")).geminiProvider();
  if (name === "anthropic")
    return (await import("./anthropic")).anthropicProvider();
  throw new LLMError(
    `AI_PROVIDER "${name}" belum didukung (pilihan: gemini, anthropic)`,
    false,
  );
}
