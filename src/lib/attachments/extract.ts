export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // lebih dari ini dilewati
export const MAX_TEXT_CHARS = 30_000;

export type Extracted =
  | { status: "DONE"; text: string }
  | { status: "UNSUPPORTED"; error: string }
  | { status: "FAILED"; error: string };

const ext = (name: string) => name.toLowerCase().split(".").pop() ?? "";
const TEXT_EXT = new Set([
  "txt",
  "csv",
  "tsv",
  "md",
  "json",
  "log",
  "xml",
  "html",
  "htm",
]);

const clean = (s: string) =>
  s
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
const cap = (s: string) =>
  s.length > MAX_TEXT_CHARS
    ? s.slice(0, MAX_TEXT_CHARS) + "\n[...dipotong]"
    : s;
const stripHtml = (h: string) =>
  h
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "");

/**
 * Ambil teks dari lampiran yang berupa dokumen. File tidak pernah dieksekusi, hanya dibaca.
 * Gambar, PDF hasil scan, dan format lain ditandai UNSUPPORTED agar dibaca manual.
 */
export async function extractText(
  buf: Buffer,
  filename: string,
  mime: string | null,
): Promise<Extracted> {
  const e = ext(filename);
  try {
    if (buf.length === 0)
      return { status: "UNSUPPORTED", error: "File kosong" };

    if (TEXT_EXT.has(e) || mime?.startsWith("text/")) {
      const raw = buf.toString("utf-8");
      const text = clean(
        e === "html" || e === "htm" || mime === "text/html"
          ? stripHtml(raw)
          : raw,
      );
      return text
        ? { status: "DONE", text: cap(text) }
        : { status: "UNSUPPORTED", error: "Tidak ada teks" };
    }

    if (e === "docx") {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: buf });
      const text = clean(value);
      return text
        ? { status: "DONE", text: cap(text) }
        : { status: "UNSUPPORTED", error: "Dokumen tidak berisi teks" };
    }

    if (e === "xlsx") {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      const parts: string[] = [];
      wb.eachSheet((ws) => {
        parts.push(`## Sheet: ${ws.name}`);
        let rows = 0;
        ws.eachRow({ includeEmpty: false }, (row) => {
          if (rows++ >= 300) return;
          const cells = (row.values as unknown[]).slice(1).map((v) => {
            if (v == null) return "";
            if (typeof v === "object") {
              const o = v as {
                text?: unknown;
                result?: unknown;
                richText?: { text: string }[];
              };
              if (o.richText) return o.richText.map((r) => r.text).join("");
              if (o.result !== undefined) return String(o.result);
              if (o.text !== undefined) return String(o.text);
              if (v instanceof Date) return v.toISOString().slice(0, 10);
              return "";
            }
            return String(v);
          });
          parts.push(cells.join("\t"));
        });
      });
      const text = clean(parts.join("\n"));
      return text.replace(/## Sheet: [^\n]*\n?/g, "").trim()
        ? { status: "DONE", text: cap(text) }
        : { status: "UNSUPPORTED", error: "Spreadsheet kosong" };
    }

    if (e === "pdf" || mime === "application/pdf") {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await pdfText(pdf, { mergePages: true });
      const t = clean(Array.isArray(text) ? text.join("\n") : text);
      // PDF hasil scan hanya berisi gambar: hampir tanpa teks.
      return t.length >= 20
        ? { status: "DONE", text: cap(t) }
        : {
            status: "UNSUPPORTED",
            error: "PDF tidak berisi teks (kemungkinan hasil scan)",
          };
    }

    return {
      status: "UNSUPPORTED",
      error: `Format .${e || "?"} belum didukung`,
    };
  } catch (err) {
    return {
      status: "FAILED",
      error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    };
  }
}
