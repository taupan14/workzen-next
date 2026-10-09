import {
  LLMError,
  type LLMProvider,
  type LLMRequest,
  type LLMResponse,
} from "./provider";

const URL = "https://api.anthropic.com/v1/messages";

export function anthropicProvider(): LLMProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    throw new LLMError(
      "ANTHROPIC_API_KEY belum diisi di environment server",
      false,
    );
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

  const send = (req: LLMRequest, withTemperature: boolean) =>
    fetch(URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: req.maxTokens ?? 4096,
        ...(withTemperature ? { temperature: 0 } : {}),
        system: req.system,
        messages: [{ role: "user", content: req.user }],
        tools: [
          {
            name: req.toolName,
            description: req.toolDescription,
            input_schema: req.inputSchema,
          },
        ],
        tool_choice: { type: "tool", name: req.toolName },
      }),
      signal: AbortSignal.timeout(90_000),
    });

  return {
    name: "anthropic",
    async call(req: LLMRequest): Promise<LLMResponse> {
      let res = await send(req, true);
      let text = res.ok ? "" : await res.text().catch(() => "");
      // Sebagian model menolak parameter temperature; ulangi sekali tanpa itu.
      if (res.status === 400 && /temperature/i.test(text)) {
        res = await send(req, false);
        text = res.ok ? "" : await res.text().catch(() => "");
      }
      if (!res.ok) {
        const retryable =
          res.status === 429 || res.status === 529 || res.status >= 500;
        throw new LLMError(
          `Anthropic ${res.status}: ${text.slice(0, 300)}`,
          retryable,
          res.status,
        );
      }
      const json: any = await res.json();
      const block = (json.content ?? []).find(
        (b: any) => b.type === "tool_use" && b.name === req.toolName,
      );
      if (!block)
        throw new LLMError("Model tidak mengembalikan hasil terstruktur", true);
      return {
        output: block.input,
        model: json.model ?? model,
        usage: {
          input_tokens: json.usage?.input_tokens ?? 0,
          output_tokens: json.usage?.output_tokens ?? 0,
        },
      };
    },
  };
}
