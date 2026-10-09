/**
 * Workzen — Phase 4: renderer PDF EPDA / Quotation.
 * Tata letak mengikuti Sales Quote ShipMate (#184/QUO-SHIPMATE/IX-26): kop logo + alamat,
 * judul "… To:", blok customer/billing, blok nomor-tanggal, bar Total hitam, tabel abu-abu,
 * Subtotal/TOTAL, penutup, footer "Page x of y".
 *
 * Fungsi murni: input -> bytes PDF. Hanya menerima data customer-facing (documents + document_lines);
 * tidak pernah menerima cost/margin/vendor, jadi tidak ada jalur kebocoran data internal.
 */
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type PDFImage,
} from "pdf-lib";

export type Treatment =
  | "CONFIRMED"
  | "ESTIMATE"
  | "CONDITIONAL"
  | "EXCLUDED"
  | "AS_PER_ACTUAL";

export interface PdfLine {
  sectionLabel?: string | null;
  description: string;
  qty?: number | null;
  uom?: string | null;
  qty2?: number | null;
  uom2?: string | null;
  unitPriceIdr?: number | null;
  discountPct?: number | null;
  amountIdr?: number | null;
  treatment: Treatment;
  remark?: string | null;
}

export interface DocumentPdfInput {
  docType: "EPDA" | "QUO";
  docNo: string;
  /** YYYY-MM-DD */
  docDate: string;
  validUntil?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  /** documents.header: billing_address, vessel_name, dwt, grt_nrt, loa_breadth, port_of_call, ... */
  header: Record<string, unknown>;
  lines: PdfLine[];
  subtotalIdr: number;
  taxAmountIdr?: number | null;
  totalIdr: number;
  conditionalIdr?: number | null;
  fxRates?: Record<string, number> | null;
  terms: {
    payment_terms?: string | string[] | null;
    exclusions?: string[];
    remarks?: string[];
    tax_note?: string | null;
    tax_mode?: string | null;
    bank?: unknown;
  };
  /** dari config template; default mengikuti jenis dokumen */
  title?: string;
  signature?: { closing?: string; name?: string; title?: string };
}

export interface CompanyInfo {
  legalName: string;
  addressLines: [string, string];
  phone: string;
  fax: string;
  web: string;
}

export const COMPANY: CompanyInfo = {
  legalName: "PT PERMATA SINAR NUSANTARA",
  addressLines: [
    "Komplek Permata Niaga Blok E No.12, Sukajadi, BATAM,",
    "KEPULAUAN RIAU, 29444",
  ],
  phone: "081111128895",
  fax: "-",
  web: "shipmate.id",
};

// ---- geometri (pt, A4). Koordinat "top" dari hasil ukur contoh Sales Quote ----
const PW = 595.28;
const PH = 841.89;
const ML = 36;
const MR = 559.3;
const TEXT_R = 549.3; // tepi kanan judul/nilai
// Product, Description, Qty, Discount, Price, Amount (Description dilebarkan dari contoh agar EPDA terbaca)
const COLS = [ML, 124, 260, 326, 371, 451, MR];
const PAD = 5;
const LINE_H = 11.1;
const CONT_TOP = 60; // awal isi pada halaman lanjutan
const BODY_LIMIT = 770; // batas bawah isi sebelum footer
const GRAY = rgb(0.8706, 0.8706, 0.8706);
const FOOT = rgb(0.45, 0.45, 0.45);
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);

type FontKey = "r" | "b" | "i";
type Color = ReturnType<typeof rgb>;
interface Seg {
  t: string;
  f?: FontKey;
  color?: Color;
}

const nf2 = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const nfq = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});
export const fmtMoney = (n: number) => nf2.format(n);
export const fmtQty = (n: number) => nfq.format(n);
export function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Karakter aman untuk font standar (WinAnsi). */
const clean = (s: string) =>
  s.replace(
    /[^\x09\x0A\x20-\x7E\xA0-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u20AC]/g,
    "?",
  );

export async function renderDocumentPdf(
  input: DocumentPdfInput,
  opts: { logoPng?: Uint8Array } = {},
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts: Record<FontKey, PDFFont> = {
    r: await pdf.embedFont(StandardFonts.Helvetica),
    b: await pdf.embedFont(StandardFonts.HelveticaBold),
    i: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };
  const logo: PDFImage | null = opts.logoPng
    ? await pdf.embedPng(opts.logoPng)
    : null;

  const isQuo = input.docType === "QUO";
  const title =
    input.title ?? (isQuo ? "Sales Quote" : "Estimate Disbursement Account");
  const pages: PDFPage[] = [];
  let page: PDFPage = pdf.addPage([PW, PH]);
  pages.push(page);

  const baseline = (top: number, size: number) => PH - top - size * 0.8;
  const width = (s: string, size: number, f: FontKey = "r") =>
    fonts[f].widthOfTextAtSize(clean(s), size);

  function text(
    s: string,
    x: number,
    top: number,
    o: {
      size?: number;
      f?: FontKey;
      color?: Color;
      right?: boolean;
      center?: boolean;
    } = {},
  ) {
    const size = o.size ?? 8;
    const f = o.f ?? "r";
    const t = clean(s);
    const w = fonts[f].widthOfTextAtSize(t, size);
    const px = o.right ? x - w : o.center ? x - w / 2 : x;
    page.drawText(t, {
      x: px,
      y: baseline(top, size),
      size,
      font: fonts[f],
      color: o.color ?? BLACK,
    });
  }

  /** Bungkus teks; boleh putus setelah spasi, "/" atau "-"; token terlalu panjang dipotong per karakter. */
  function wrap(
    s: string,
    maxW: number,
    size: number,
    f: FontKey = "r",
  ): string[] {
    const out: string[] = [];
    for (const para of clean(s).split("\n")) {
      const tokens = para.split(/(?<=[ /-])/);
      let cur = "";
      const flush = () => {
        out.push(cur.trimEnd());
        cur = "";
      };
      for (const tk of tokens) {
        if (cur !== "" && width((cur + tk).trimEnd(), size, f) > maxW) flush();
        if (width(tk.trimEnd(), size, f) > maxW) {
          for (const ch of tk) {
            if (cur !== "" && width(cur + ch, size, f) > maxW) flush();
            cur += ch;
          }
        } else cur += tk;
      }
      flush();
    }
    return out.length ? out : [""];
  }

  type VLine = { t: string; f: FontKey; color?: Color };
  const segLines = (segs: Seg[], maxW: number, size: number): VLine[] =>
    segs.flatMap((sg) =>
      wrap(sg.t, maxW, size, sg.f ?? "r").map((t) => ({
        t,
        f: sg.f ?? ("r" as FontKey),
        color: sg.color,
      })),
    );

  // ================= halaman 1: kop =================
  if (logo)
    page.drawImage(logo, {
      x: 41,
      y: PH - 52.1 - 50.4,
      width: 150,
      height: 50.4,
    });
  text(COMPANY.addressLines[0], 256, 39.7, { size: 9 });
  text(COMPANY.addressLines[1], 256, 52.2, { size: 9 });
  text(`Telepon ${COMPANY.phone}`, 256, 69.7, { size: 9 });
  text(`Fax ${COMPANY.fax}`, 256, 84.2, { size: 9 });
  text(COMPANY.web, 256, 101.8, { size: 9 });
  text(COMPANY.legalName, 41, 145.2, { size: 10 });
  text(`${title} To:`, 41, 179, { size: 14 });
  text(title, TEXT_R, 179, { size: 14, f: "b", right: true });
  page.drawLine({
    start: { x: ML, y: PH - 201 },
    end: { x: MR, y: PH - 201 },
    thickness: 1,
    color: BLACK,
  });

  // customer (kiri) + billing (tengah)
  let leftBottom = 219.7;
  if (input.customerName)
    for (const l of wrap(input.customerName, 160, 8)) {
      text(l, 41, leftBottom);
      leftBottom += LINE_H;
    }
  if (input.customerEmail) {
    text(`(${input.customerEmail})`, 41, leftBottom);
    leftBottom += LINE_H;
  }
  let midBottom = 219.7;
  const billing =
    typeof input.header.billing_address === "string"
      ? input.header.billing_address
      : "";
  if (billing) {
    text("Billing Address :", 209, 244, { f: "i" });
    let by = 257.1;
    for (const l of wrap(billing, 150, 8)) {
      text(l, 209, by);
      by += LINE_H;
    }
    midBottom = by;
  }

  // nomor & tanggal (kanan)
  let ry = 219.7;
  text(isQuo ? "No. Quote :" : "Ref. No :", 371, ry, { f: "b" });
  for (const l of wrap(input.docNo, 118, 8, "b")) {
    text(l, TEXT_R, ry, { f: "b", right: true });
    ry += LINE_H;
  }
  ry += 2.1;
  text(isQuo ? "Transaction Date :" : "Created Date :", 371, ry);
  text(fmtDate(input.docDate), TEXT_R, ry, { right: true });
  ry += 13.1;
  if (input.validUntil) {
    text(isQuo ? "Expired Date :" : "Valid Until :", 371, ry);
    text(fmtDate(input.validUntil), TEXT_R, ry, { right: true });
    ry += 13.1;
  }
  let blocksBottom = Math.max(leftBottom, midBottom, ry) + 4;

  // rincian kapal / lokasi (hanya yang terisi)
  const detailDefs: Array<[string, string]> = [
    ["Vessel Name", "vessel_name"],
    ["DWT", "dwt"],
    ["GRT / NRT", "grt_nrt"],
    ["LOA / Breadth", "loa_breadth"],
    ["Port of Call", "port_of_call"],
    ["Purpose of Call", "purpose_of_call"],
    ["Activity", "activity"],
    ["Cargo / Volume", "cargo"],
    ["ETA", "eta"],
    ["Location", "location"],
  ];
  const details: Array<[string, string]> = [];
  for (const [label, key] of detailDefs) {
    const v = input.header[key];
    if (v != null && String(v).trim() !== "")
      details.push([label, String(v).trim()]);
  }
  if (input.fxRates)
    for (const [ccy, r] of Object.entries(input.fxRates))
      details.push(["Est. Exch. Rate", `1 ${ccy} = Rp ${fmtMoney(r)}`]);
  if (details.length) {
    blocksBottom += 8;
    for (let i = 0; i < details.length; i += 2) {
      let rowH = 0;
      details.slice(i, i + 2).forEach(([label, value], k) => {
        const x = k === 0 ? 41 : 300;
        const ls = wrap(value, 150, 8);
        text(label, x, blocksBottom, { f: "b" });
        ls.forEach((l, n) => text(l, x + 78, blocksBottom + n * LINE_H));
        rowH = Math.max(rowH, ls.length * LINE_H);
      });
      blocksBottom += rowH + 1.5;
    }
  }

  // bar Total
  const barTop = blocksBottom + 21;
  page.drawRectangle({
    x: 336,
    y: PH - barTop - 22.5,
    width: MR - 336,
    height: 22.5,
    color: BLACK,
  });
  text("Total", 341, barTop + 7.7, { size: 9, color: WHITE });
  text(fmtMoney(input.totalIdr), 552.8, barTop + 7.7, {
    size: 9,
    color: WHITE,
    right: true,
  });

  // ================= tabel =================
  const headerLabels = [
    "Product",
    "Description",
    "Qty",
    "Discount",
    "Price (Rp.)",
    "Amount (Rp.)",
  ];
  /** gambar header tabel dengan teks pada `top`; kembalikan posisi awal baris pertama */
  function drawTableHeader(top: number): number {
    headerLabels.forEach((h, i) => {
      if (i === 0) text(h, COLS[0] + PAD, top, { size: 9, f: "b" });
      else text(h, COLS[i + 1] - PAD, top, { size: 9, f: "b", right: true });
    });
    const underline = top + 14.8;
    page.drawLine({
      start: { x: ML, y: PH - underline },
      end: { x: MR, y: PH - underline },
      thickness: 2,
      color: BLACK,
    });
    return underline;
  }
  let y = drawTableHeader(barTop + 22.5 + 29.7);

  const tableLines = input.lines.filter((l) => l.treatment !== "EXCLUDED");
  const excludedDescs = input.lines
    .filter((l) => l.treatment === "EXCLUDED")
    .map((l) => l.description);

  function cellsFor(l: PdfLine): { segs: Seg[][]; right: boolean[] } {
    const desc: Seg[] = [{ t: l.description }];
    if (l.treatment === "ESTIMATE") desc.push({ t: "(Estimate)", f: "i" });
    if (l.treatment === "CONDITIONAL")
      desc.push({ t: "(Conditional - not included in total)", f: "i" });
    if (l.remark)
      desc.push({ t: l.remark, f: "i", color: rgb(0.25, 0.25, 0.25) });
    const hasQ2 = l.qty2 != null && l.qty2 !== 1;
    const q: Seg[] = [];
    const qtyText =
      l.qty != null
        ? fmtQty(l.qty) + (hasQ2 ? ` x ${fmtQty(l.qty2 as number)}` : "")
        : "";
    const unit = [l.uom, hasQ2 ? l.uom2 : null].filter(Boolean).join(" x ");
    const qtyW = COLS[3] - COLS[2] - PAD * 2;
    if (qtyText && unit && width(`${qtyText} ${unit}`, 8) <= qtyW)
      q.push({ t: `${qtyText} ${unit}` });
    else {
      if (qtyText) q.push({ t: qtyText });
      if (unit) q.push({ t: unit, color: rgb(0.3, 0.3, 0.3) });
    }
    const amount: Seg[] =
      l.treatment === "AS_PER_ACTUAL"
        ? [{ t: "As per actual", f: "i" }]
        : l.amountIdr == null
          ? [{ t: "-" }]
          : l.treatment === "CONDITIONAL"
            ? [{ t: `(${fmtMoney(l.amountIdr)})`, f: "i" }]
            : [{ t: fmtMoney(l.amountIdr) }];
    return {
      segs: [
        [{ t: l.sectionLabel ?? "" }],
        desc,
        q,
        l.qty != null ? [{ t: `${(l.discountPct ?? 0).toFixed(1)}%` }] : [],
        l.unitPriceIdr != null ? [{ t: fmtMoney(l.unitPriceIdr) }] : [],
        amount,
      ],
      right: [false, false, true, true, true, true],
    };
  }

  function goNextPage(): void {
    page = pdf.addPage([PW, PH]);
    pages.push(page);
  }

  for (const l of tableLines) {
    const { segs, right } = cellsFor(l);
    const cellLines = segs.map((s, i) =>
      segLines(s, COLS[i + 1] - COLS[i] - PAD * 2, 8),
    );
    const n = Math.max(1, ...cellLines.map((c) => c.length));
    const rowH = n * LINE_H + 4.2;
    if (y + rowH > BODY_LIMIT) {
      goNextPage();
      y = drawTableHeader(CONT_TOP);
    }
    cellLines.forEach((cl, i) => {
      page.drawRectangle({
        x: COLS[i],
        y: PH - y - rowH,
        width: COLS[i + 1] - COLS[i],
        height: rowH,
        color: GRAY,
        borderColor: WHITE,
        borderWidth: 1,
      });
      cl.forEach((vl, k) => {
        const top = y + 4.7 + k * LINE_H;
        if (right[i])
          text(vl.t, COLS[i + 1] - PAD, top, {
            f: vl.f,
            color: vl.color,
            right: true,
          });
        else text(vl.t, COLS[i] + PAD, top, { f: vl.f, color: vl.color });
      });
    });
    y += rowH;
  }

  // ================= total =================
  const ensure = (h: number) => {
    if (y + h > BODY_LIMIT) {
      goNextPage();
      y = CONT_TOP;
    }
  };

  ensure(80);
  y += 42.7;
  const totalRows: Array<{ label: string; value: string; f: FontKey }> = [
    { label: "Subtotal", value: fmtMoney(input.subtotalIdr), f: "r" },
  ];
  if (input.taxAmountIdr != null)
    totalRows.push({
      label: "Tax",
      value: fmtMoney(input.taxAmountIdr),
      f: "r",
    });
  totalRows.push({ label: "TOTAL", value: fmtMoney(input.totalIdr), f: "b" });
  for (const r of totalRows) {
    text(r.label, 478, y, { size: 9, f: r.f, right: true });
    text(r.value, 553.3, y, { size: 9, f: r.f, right: true });
    y += 18.5;
  }
  if (input.conditionalIdr && input.conditionalIdr > 0) {
    text("Conditional items (not included in total)", 478, y, {
      size: 8,
      f: "i",
      right: true,
    });
    text(fmtMoney(input.conditionalIdr), 553.3, y, {
      size: 8,
      f: "i",
      right: true,
    });
    y += 16;
  }

  // ================= catatan & syarat =================
  const notes: Array<{ head: string; body: string[] }> = [];
  if (input.terms.tax_note)
    notes.push({ head: "Tax", body: [input.terms.tax_note] });
  const remarks = (input.terms.remarks ?? []).filter(Boolean);
  if (remarks.length) notes.push({ head: "Remarks", body: remarks });
  const excl = [...(input.terms.exclusions ?? []), ...excludedDescs].filter(
    Boolean,
  );
  if (excl.length) notes.push({ head: "Exclusions", body: excl });
  const pt = input.terms.payment_terms;
  const ptList = Array.isArray(pt) ? pt : pt ? [pt] : [];
  if (ptList.length) notes.push({ head: "Payment Terms", body: ptList });
  if (input.terms.bank && typeof input.terms.bank === "object") {
    notes.push({
      head: "Bank",
      body: Object.entries(input.terms.bank as Record<string, unknown>).map(
        ([k, v]) => `${k}: ${String(v)}`,
      ),
    });
  } else if (typeof input.terms.bank === "string") {
    notes.push({ head: "Bank", body: [input.terms.bank] });
  }
  for (const nt of notes) {
    const bodyLines = nt.body.flatMap((b) => wrap(b, 440, 8));
    ensure(LINE_H * (bodyLines.length + 1) + 8);
    text(nt.head, 41, y, { f: "b" });
    y += LINE_H;
    for (const bl of bodyLines) {
      text(bl, 41, y);
      y += LINE_H;
    }
    y += 8;
  }

  // ================= penutup =================
  const sig = {
    closing: "Best Regards,",
    name: "SHIPMATE",
    title: "Sales Dept.",
    ...(input.signature ?? {}),
  };
  ensure(100);
  y += 10;
  text(sig.closing, 492, y, { size: 9, center: true });
  text(sig.name, 492, y + 62, { size: 9, center: true });
  text(sig.title, 492, y + 75, { size: 9, center: true });

  // ================= footer =================
  const total = pages.length;
  pages.forEach((p, i) => {
    const size = 9;
    const left = clean(`${title} #${input.docNo}`);
    const right = clean(`Page ${i + 1} of ${total}`);
    p.drawText(left, {
      x: ML,
      y: baseline(805.5, size),
      size,
      font: fonts.r,
      color: FOOT,
    });
    const w = fonts.r.widthOfTextAtSize(right, size);
    p.drawText(right, {
      x: MR - w,
      y: baseline(805.5, size),
      size,
      font: fonts.r,
      color: FOOT,
    });
  });

  pdf.setTitle(`${title} ${input.docNo}`);
  pdf.setProducer("Workzen");
  return pdf.save();
}
