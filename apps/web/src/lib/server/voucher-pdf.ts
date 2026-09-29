import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { draw, hexToRgb, loadFont, money, width, wrap } from "./invoice-pdf";

export interface PdfVoucher {
  code: string;
  initial_amount: number;
  balance: number;
  recipient_name: string | null;
  message: string | null;
  expires_at: string | null;
  service_name?: string | null;
}

export async function buildVoucherPdf(voucher: PdfVoucher, options: { salonName: string; accent?: string; bookingUrl?: string; productName?: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`Dárkový poukaz ${voucher.code}`);
  const regular = await loadFont(pdf, 400);
  const semi = await loadFont(pdf, 600);
  const bold = await loadFont(pdf, 700);
  const accent = hexToRgb(options.accent ?? "#3056d3");
  const W = 595;
  const H = 842;
  const page = pdf.addPage([W, H]);

  const cardX = 40;
  const cardW = W - 80;
  const cardH = 360;
  const cardY = H - 60 - cardH;
  page.drawRectangle({ x: cardX, y: cardY, width: cardW, height: cardH, color: accent });
  page.drawCircle({ x: cardX + cardW - 50, y: cardY + cardH - 30, size: 170, color: rgb(1, 1, 1), opacity: 0.09 });
  page.drawCircle({ x: cardX + 40, y: cardY + 20, size: 110, color: rgb(0, 0, 0), opacity: 0.08 });

  draw(page, semi, "DÁRKOVÝ POUKAZ", cardX + 32, cardY + cardH - 46, 11, rgb(1, 1, 1));
  draw(page, bold, options.salonName, cardX + 32, cardY + cardH - 74, 24, rgb(1, 1, 1));
  const amount = money(voucher.initial_amount).replace(",00", "");
  draw(page, bold, amount, cardX + 32, cardY + cardH - 160, 56, rgb(1, 1, 1));
  if (voucher.service_name) draw(page, regular, `na službu: ${voucher.service_name}`, cardX + 32, cardY + cardH - 184, 12, rgb(1, 1, 1));

  if (voucher.recipient_name) {
    draw(page, regular, "Pro", cardX + 32, cardY + 118, 10, rgb(1, 1, 1));
    draw(page, semi, voucher.recipient_name, cardX + 32, cardY + 100, 16, rgb(1, 1, 1));
  }
  if (voucher.message) {
    wrap(regular, voucher.message, 11, 300)
      .slice(0, 3)
      .forEach((line, i) => draw(page, regular, line, cardX + 32, cardY + 76 - i * 14, 11, rgb(1, 1, 1)));
  }

  const qr = await QRCode.toBuffer(options.bookingUrl ?? voucher.code, { type: "png", width: 300, margin: 1 });
  const image = await pdf.embedPng(qr);
  page.drawRectangle({ x: cardX + cardW - 150, y: cardY + 30, width: 118, height: 118, color: rgb(1, 1, 1) });
  page.drawImage(image, { x: cardX + cardW - 145, y: cardY + 35, width: 108, height: 108 });

  const codeY = cardY - 48;
  page.drawRectangle({ x: cardX, y: codeY - 12, width: cardW, height: 56, borderColor: accent, borderWidth: 1.5, color: rgb(0.98, 0.98, 1) });
  draw(page, regular, "KÓD POUKAZU", cardX + 20, codeY + 22, 9, rgb(0.4, 0.42, 0.52));
  draw(page, bold, voucher.code, cardX + 20, codeY - 2, 24, rgb(0.08, 0.08, 0.17));
  if (voucher.expires_at) draw(page, semi, `Platí do ${new Date(voucher.expires_at).toLocaleDateString("cs-CZ")}`, cardX + cardW - 20, codeY + 6, 12, rgb(0.08, 0.08, 0.17), "right");

  let y = codeY - 50;
  draw(page, semi, "Jak poukaz uplatnit", cardX, y, 12);
  y -= 20;
  for (const line of [
    "1. Objednejte se online nebo telefonicky a uveďte kód poukazu.",
    "2. Při návštěvě kód předložte, hodnota se odečte z ceny služeb.",
    "3. Nevyčerpaný zůstatek zůstává na poukazu až do konce platnosti.",
  ]) {
    draw(page, regular, line, cardX, y, 10.5, rgb(0.25, 0.27, 0.36));
    y -= 16;
  }
  if (options.bookingUrl) {
    y -= 10;
    draw(page, semi, "Online rezervace", cardX, y, 10);
    draw(page, regular, options.bookingUrl, cardX, y - 15, 10, accent);
  }
  const foot = `Vystaveno v systému ${options.productName ?? "Terminio"}`;
  draw(page, regular, foot, W / 2 - width(regular, foot, 8) / 2, 30, 8, rgb(0.5, 0.52, 0.6));

  return pdf.save();
}
