import { resolveProviderName } from "./provider";

/** Ambang keyakinan (0-1). Item di bawah ambang masuk antrean review. */
export const confidenceThreshold = () => {
  const v = Number(process.env.AI_CONFIDENCE_THRESHOLD);
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.8;
};

/** Paket gratis Gemini: Google dapat memakai isi prompt untuk meningkatkan produknya. Tampilkan peringatan di UI. */
export const showFreeTierNotice = () =>
  resolveProviderName() === "gemini" &&
  process.env.GEMINI_TIER?.toLowerCase() !== "paid";
