import { z } from "zod";

export const CLASSES = [
  "INQUIRY",
  "FOLLOW_UP",
  "AUTO_REPLY",
  "NEWSLETTER",
  "SPAM",
  "OTHER",
] as const;

/** Field standar lintas industri. Field di luar daftar ini tetap diterima sebagai field kustom. */
export const STANDARD_FIELDS = [
  {
    key: "customer_company",
    label: "Customer company",
    hint: "Customer or company name",
    required: false,
  },
  {
    key: "contact_person",
    label: "Contact person",
    hint: "Person who wrote or should be contacted",
    required: false,
  },
  {
    key: "contact_email",
    label: "Contact email",
    hint: "Contact email address, if different from the sender",
    required: false,
  },
  {
    key: "contact_phone",
    label: "Contact phone",
    hint: "Contact phone number",
    required: false,
  },
  {
    key: "request_type",
    label: "Request type",
    hint: "What is being requested (service, product, quotation, proposal, ...)",
    required: true,
  },
  {
    key: "project_description",
    label: "Project description",
    hint: "What the work or purchase is about",
    required: true,
  },
  {
    key: "location",
    label: "Location",
    hint: "Site, city, or delivery location",
    required: false,
  },
  {
    key: "quantity",
    label: "Quantity / size",
    hint: "Amount, area, volume, or number of units (unit goes in `unit`)",
    required: false,
  },
  {
    key: "deadline",
    label: "Deadline",
    hint: "When the customer needs the answer or delivery",
    required: true,
  },
  {
    key: "budget",
    label: "Budget",
    hint: "Stated budget or price expectation",
    required: false,
  },
  {
    key: "reference_documents",
    label: "Reference documents",
    hint: "Documents the email refers to (names or links)",
    required: false,
  },
] as const;

export const REQUIRED_KEYS: string[] = STANDARD_FIELDS.filter(
  (f) => f.required,
).map((f) => f.key);
export const standardLabel = (key: string) =>
  STANDARD_FIELDS.find((f) => f.key === key)?.label;

// Model kadang menjawab 95 untuk 0.95; terima dan normalkan.
export const conf = z.preprocess(
  (v) => (typeof v === "number" && v > 1 && v <= 100 ? v / 100 : v),
  z.number().min(0).max(1),
);
const key = z.string().regex(/^[a-z][a-z0-9_]{1,39}$/);
const quote = z.string().max(600).nullable();

export const AnalysisOutput = z.object({
  classification: z.enum(CLASSES),
  classification_confidence: conf,
  language: z.enum(["id", "en", "other"]),
  summary: z.string().max(800),
  fields: z
    .array(
      z.object({
        key,
        label: z.string().max(80),
        value: z.string().max(1000).nullable(),
        unit: z.string().max(40).nullable(),
        confidence: conf,
        source_quote: quote,
      }),
    )
    .max(30),
  requirements: z
    .array(
      z.object({
        title: z.string().max(160),
        description: z.string().max(1000),
        department_code: z.string().max(10).nullable(),
        confidence: conf,
        source_quote: quote,
      }),
    )
    .max(20),
  missing_information: z
    .array(
      z.object({
        key,
        label: z.string().max(80),
        question: z.string().max(300),
      }),
    )
    .max(20),
  routing: z
    .array(
      z.object({
        department_code: z.string().max(10),
        reason: z.string().max(300),
        confidence: conf,
      }),
    )
    .max(10),
});
export type AnalysisOutputT = z.infer<typeof AnalysisOutput>;

const str = { type: "string" };
const nstr = { type: ["string", "null"] };
const num01 = { type: "number", minimum: 0, maximum: 1 };

/** Skema tool untuk structured output (harus sejalan dengan zod di atas). */
export const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  required: [
    "classification",
    "classification_confidence",
    "language",
    "summary",
    "fields",
    "requirements",
    "missing_information",
    "routing",
  ],
  properties: {
    classification: { type: "string", enum: [...CLASSES] },
    classification_confidence: num01,
    language: { type: "string", enum: ["id", "en", "other"] },
    summary: str,
    fields: {
      type: "array",
      items: {
        type: "object",
        required: [
          "key",
          "label",
          "value",
          "unit",
          "confidence",
          "source_quote",
        ],
        properties: {
          key: str,
          label: str,
          value: nstr,
          unit: nstr,
          confidence: num01,
          source_quote: nstr,
        },
      },
    },
    requirements: {
      type: "array",
      items: {
        type: "object",
        required: [
          "title",
          "description",
          "department_code",
          "confidence",
          "source_quote",
        ],
        properties: {
          title: str,
          description: str,
          department_code: nstr,
          confidence: num01,
          source_quote: nstr,
        },
      },
    },
    missing_information: {
      type: "array",
      items: {
        type: "object",
        required: ["key", "label", "question"],
        properties: { key: str, label: str, question: str },
      },
    },
    routing: {
      type: "array",
      items: {
        type: "object",
        required: ["department_code", "reason", "confidence"],
        properties: { department_code: str, reason: str, confidence: num01 },
      },
    },
  },
} as const;
