import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

export interface PdfInvoice {
  kind: "invoice" | "proforma" | "credit_note";
  number: string | null;
  status: string;
  issue_date: string | null;
  taxable_supply_date: string | null;
  due_date: string | null;
  variable_symbol: string | null;
  vat_payer: boolean;
  supplier: {
    name?: string;
    ico?: string;
    dic?: string;
    street?: string;
    city?: string;
    zip?: string;
    iban?: string;
    bank_account?: string;
    note?: string;
    vat_payer?: boolean;
  } | null;
  customer_name: string;
  customer_ico: string | null;
  customer_dic: string | null;
  customer_street: string | null;
  customer_city: string | null;
  customer_zip: string | null;
  total_net: number;
  total_vat: number;
  total_gross: number;
  advance_paid: number;
  paid_amount: number;
  vat_summary: { rate: number; base: number; vat: number; gross: number }[];
  note: string | null;
}

export interface PdfItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  total_gross: number;
}

export interface FontPair {
  latin: PDFFont;
  ext: PDFFont;
  latinSet: Set<number>;
  extSet: Set<number>;
}

export async function loadFont(pdf: PDFDocument, weight: number): Promise<FontPair> {
  const dir = join(process.cwd(), "node_modules", "@fontsource", "inter", "files");
  const [latinBytes, extBytes] = await Promise.all([readFile(join(dir, `inter-latin-${weight}-normal.woff`)), readFile(join(dir, `inter-latin-ext-${weight}-normal.woff`))]);
  const latin = await pdf.embedFont(latinBytes, { subset: true });
  const ext = await pdf.embedFont(extBytes, { subset: true });
  return { latin, ext, latinSet: new Set(latin.getCharacterSet()), extSet: new Set(ext.getCharacterSet()) };
}

function runs(font: FontPair, text: string): { font: PDFFont; text: string }[] {
  const result: { font: PDFFont; text: string }[] = [];
  for (const char of text.replace(/ /g, " ").replace(/ /g, " ")) {
    const cp = char.codePointAt(0)!;
    const chosen = font.latinSet.has(cp) ? font.latin : font.extSet.has(cp) ? font.ext : font.latin;
    const safe = chosen === font.latin && !font.latinSet.has(cp) ? "?" : char;
    const last = result.at(-1);
    if (last && last.font === chosen) last.text += safe;
    else result.push({ font: chosen, text: safe });
  }
  return result;
}

export function width(font: FontPair, text: string, size: number): number {
  return runs(font, text).reduce((sum, run) => sum + run.font.widthOfTextAtSize(run.text, size), 0);
}

export function draw(page: PDFPage, font: FontPair, text: string, x: number, y: number, size: number, color = rgb(0.08, 0.08, 0.17), align: "left" | "right" = "left") {
  const total = width(font, text, size);
  let cursor = align === "right" ? x - total : x;
  for (const run of runs(font, text)) {
    page.drawText(run.text, { x: cursor, y, size, font: run.font, color });
    cursor += run.font.widthOfTextAtSize(run.text, size);
  }
}

export function wrap(font: FontPair, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (width(font, candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

export const money = (halere: number) => `${(halere / 100).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`.replace(/ /g, " ");
const dateCz = (value: string | null) => (value ? value.split("-").reverse().map((x) => String(Number(x))).join(". ").replace(/(\d+)\. (\d+)\. (\d+)/, "$1. $2. $3") : "");

export function hexToRgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export async function buildInvoicePdf(invoice: PdfInvoice, items: PdfItem[], options: { spayd?: string | null; accent?: string; productName?: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(invoice.number ?? "Faktura");
  pdf.setProducer(options.productName ?? "Terminio");
  const regular = await loadFont(pdf, 400);
  const semi = await loadFont(pdf, 600);
  const bold = await loadFont(pdf, 700);
  const accent = hexToRgb(options.accent ?? "#3056d3");
  const muted = rgb(0.4, 0.42, 0.52);
  const line = rgb(0.9, 0.9, 0.94);
  const W = 595;
  const H = 842;
  const M = 44;

  let page = pdf.addPage([W, H]);
  const title = invoice.kind === "credit_note" ? "Dobropis" : invoice.kind === "proforma" ? "Zálohová faktura" : invoice.vat_payer ? "Faktura – daňový doklad" : "Faktura";

  page.drawRectangle({ x: 0, y: H - 10, width: W, height: 10, color: accent });
  draw(page, regular, title.toUpperCase(), M, H - 52, 9, muted);
  draw(page, bold, invoice.number ?? "KONCEPT", M, H - 80, 24);
  if (invoice.status === "paid") draw(page, bold, "UHRAZENO", W - M, H - 76, 16, rgb(0.06, 0.66, 0.42), "right");
  if (invoice.status === "cancelled") draw(page, bold, "STORNOVÁNO", W - M, H - 76, 16, rgb(0.9, 0.28, 0.3), "right");

  const boxTop = H - 116;
  const col = (W - 2 * M - 20) / 2;
  const party = (x: number, label: string, name: string, lines: string[]) => {
    page.drawRectangle({ x, y: boxTop - 96, width: col, height: 96, borderColor: line, borderWidth: 1, color: rgb(0.985, 0.985, 0.995) });
    draw(page, semi, label.toUpperCase(), x + 12, boxTop - 18, 8, muted);
    draw(page, bold, name, x + 12, boxTop - 36, 11);
    lines.filter(Boolean).slice(0, 4).forEach((text, i) => draw(page, regular, text, x + 12, boxTop - 52 - i * 12, 9, rgb(0.25, 0.27, 0.36)));
  };
  const s = invoice.supplier ?? {};
  party(M, "Dodavatel", s.name ?? "", [[s.street].filter(Boolean).join(""), [s.zip, s.city].filter(Boolean).join(" "), `IČO: ${s.ico ?? ""}`, s.dic ? `DIČ: ${s.dic}` : "Neplátce DPH"]);
  party(M + col + 20, "Odběratel", invoice.customer_name, [invoice.customer_street ?? "", [invoice.customer_zip, invoice.customer_city].filter(Boolean).join(" "), invoice.customer_ico ? `IČO: ${invoice.customer_ico}` : "", invoice.customer_dic ? `DIČ: ${invoice.customer_dic}` : ""]);

  let y = boxTop - 122;
  const meta: [string, string][] = [
    ["Datum vystavení", dateCz(invoice.issue_date)],
    ...(invoice.kind !== "proforma" ? ([["Datum zdanitelného plnění", dateCz(invoice.taxable_supply_date)]] as [string, string][]) : []),
    ["Splatnost", dateCz(invoice.due_date)],
    ["Variabilní symbol", invoice.variable_symbol ?? ""],
    ["Způsob úhrady", "Bankovní převod"],
    ["Účet", s.bank_account ?? s.iban ?? ""],
  ];
  const cellW = (W - 2 * M) / 3;
  meta.forEach(([label, value], i) => {
    const cx = M + (i % 3) * cellW;
    const cy = y - Math.floor(i / 3) * 34;
    draw(page, regular, label, cx, cy, 8, muted);
    draw(page, semi, value, cx, cy - 13, 10);
  });
  y -= 82;

  const cols = invoice.vat_payer
    ? { desc: M, qty: 300, unit: 372, vat: 432, total: W - M }
    : { desc: M, qty: 360, unit: 440, vat: 0, total: W - M };
  const header = () => {
    page.drawRectangle({ x: M, y: y - 8, width: W - 2 * M, height: 24, color: rgb(0.955, 0.953, 0.99) });
    draw(page, semi, "Popis", cols.desc + 8, y, 8.5, muted);
    draw(page, semi, "Množství", cols.qty, y, 8.5, muted, "right");
    draw(page, semi, "Cena za jedn.", cols.unit + 62, y, 8.5, muted, "right");
    if (invoice.vat_payer) draw(page, semi, "DPH", cols.vat + 28, y, 8.5, muted, "right");
    draw(page, semi, invoice.vat_payer ? "Celkem s DPH" : "Celkem", cols.total - 8, y, 8.5, muted, "right");
    y -= 28;
  };
  header();

  for (const item of items) {
    const lines = wrap(regular, item.description, 10, cols.qty - cols.desc - 70);
    const rowHeight = Math.max(22, lines.length * 13 + 8);
    if (y - rowHeight < 190) {
      page = pdf.addPage([W, H]);
      y = H - 60;
      header();
    }
    lines.forEach((text, i) => draw(page, regular, text, cols.desc + 8, y - i * 13, 10));
    draw(page, regular, `${Number(item.quantity).toLocaleString("cs-CZ")} ${item.unit}`, cols.qty, y, 10, rgb(0.08, 0.08, 0.17), "right");
    draw(page, regular, money(item.unit_price), cols.unit + 62, y, 10, rgb(0.08, 0.08, 0.17), "right");
    if (invoice.vat_payer) draw(page, regular, `${Number(item.vat_rate)} %`, cols.vat + 28, y, 10, rgb(0.08, 0.08, 0.17), "right");
    draw(page, semi, money(item.total_gross), cols.total - 8, y, 10, rgb(0.08, 0.08, 0.17), "right");
    y -= rowHeight;
    page.drawLine({ start: { x: M, y: y + 10 }, end: { x: W - M, y: y + 10 }, thickness: 0.5, color: line });
  }

  if (y < 200) {
    page = pdf.addPage([W, H]);
    y = H - 60;
  }
  y -= 8;

  if (invoice.vat_payer && invoice.vat_summary.length) {
    draw(page, semi, "REKAPITULACE DPH", M, y, 8, muted);
    y -= 16;
    for (const row of invoice.vat_summary) {
      draw(page, regular, `Sazba ${Number(row.rate)} %`, M, y, 9);
      draw(page, regular, `Základ ${money(row.base)}`, M + 150, y, 9);
      draw(page, regular, `DPH ${money(row.vat)}`, M + 300, y, 9);
      y -= 13;
    }
    y -= 6;
  }

  const boxX = W - M - 230;
  page.drawRectangle({ x: boxX, y: y - 62, width: 230, height: 70, color: accent });
  const balance = invoice.total_gross - invoice.advance_paid - invoice.paid_amount;
  draw(page, regular, invoice.advance_paid > 0 ? `Celkem ${money(invoice.total_gross)}, záloha −${money(invoice.advance_paid)}` : "Celkem k úhradě", boxX + 14, y - 10, 9, rgb(1, 1, 1));
  draw(page, bold, money(invoice.status === "paid" || invoice.kind === "credit_note" ? invoice.total_gross : Math.max(0, balance) || invoice.total_gross), boxX + 14, y - 42, 20, rgb(1, 1, 1));

  if (options.spayd) {
    const png = await QRCode.toBuffer(options.spayd, { type: "png", width: 320, margin: 1, errorCorrectionLevel: "M" });
    const image = await pdf.embedPng(png);
    page.drawImage(image, { x: M, y: y - 74, width: 82, height: 82 });
    draw(page, semi, "QR platba", M + 94, y - 6, 10);
    draw(page, regular, "Naskenujte v aplikaci své banky.", M + 94, y - 20, 8.5, muted);
    draw(page, regular, `VS ${invoice.variable_symbol ?? ""}`, M + 94, y - 33, 8.5, muted);
  }

  let footerY = y - 110;
  const noteText = [invoice.note, s.note].filter(Boolean).join("\n");
  if (noteText) {
    for (const text of wrap(regular, noteText, 9, W - 2 * M)) {
      draw(page, regular, text, M, footerY, 9, muted);
      footerY -= 12;
    }
  }
  draw(page, regular, `Vystaveno v systému ${options.productName ?? "Terminio"}`, M, 30, 8, muted);
  draw(page, regular, invoice.number ?? "", W - M, 30, 8, muted, "right");

  return pdf.save();
}
