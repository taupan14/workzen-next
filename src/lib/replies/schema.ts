import { z } from "zod";
import { conf } from "@/lib/ai/schema";

export const INTENTS = [
  "ANSWER",
  "PARTIAL",
  "QUESTION",
  "BLOCKED",
  "DECLINE",
  "ACKNOWLEDGE",
  "AUTO_REPLY",
  "OTHER",
] as const;

// Model kadang menulis angka sebagai string ("12500"); terima dan ubah.
const num = z.preprocess(
  (v) =>
    typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
      ? Number(v)
      : v,
  z.number().finite().nullable(),
);
const str = (max: number) => z.string().max(max).nullable();

export const ReplyOutput = z.object({
  intent: z.enum(INTENTS),
  intent_confidence: conf,
  summary: z.string().max(800),
  blocker: str(500),
  questions: z.array(z.string().max(400)).max(15),
  ambiguities: z.array(z.string().max(400)).max(15),
  cost_items: z
    .array(
      z.object({
        vendor: str(160),
        item: str(200),
        quantity: num,
        uom: str(40),
        rate: num,
        currency: str(12),
        validity: str(30),
        availability: str(160),
        notes: str(400),
        confidence: conf,
        source_quote: str(600),
      }),
    )
    .max(50),
});
export type ReplyOutputT = z.infer<typeof ReplyOutput>;

const s = { type: "string" };
const ns = { type: ["string", "null"] };
const nn = { type: ["number", "null"] };

export const REPLY_JSON_SCHEMA = {
  type: "object",
  required: [
    "intent",
    "intent_confidence",
    "summary",
    "blocker",
    "questions",
    "ambiguities",
    "cost_items",
  ],
  properties: {
    intent: { type: "string", enum: [...INTENTS] },
    intent_confidence: { type: "number", minimum: 0, maximum: 1 },
    summary: s,
    blocker: ns,
    questions: { type: "array", items: s },
    ambiguities: { type: "array", items: s },
    cost_items: {
      type: "array",
      items: {
        type: "object",
        required: [
          "vendor",
          "item",
          "quantity",
          "uom",
          "rate",
          "currency",
          "validity",
          "availability",
          "notes",
          "confidence",
          "source_quote",
        ],
        properties: {
          vendor: ns,
          item: ns,
          quantity: nn,
          uom: ns,
          rate: nn,
          currency: ns,
          validity: ns,
          availability: ns,
          notes: ns,
          confidence: { type: "number", minimum: 0, maximum: 1 },
          source_quote: ns,
        },
      },
    },
  },
} as const;
