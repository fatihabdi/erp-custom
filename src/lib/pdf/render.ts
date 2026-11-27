import { terbilangRupiah } from "@/lib/terbilang";
import {
  bankBlock, C, columns, F, fmtDateFull, fmtNum, footer, header, M, newDoc, notesBlock, partyBlock, ph, signature,
  table, termsTable, terbilangBox, toBuffer, totalsBlock, watermark, type Doc,
} from "./kit";
import type { InvoicePdf, OrderPdf, PdfItem, QuotationPdf, ReceiptPdf } from "./types";

type Opts = { compress?: boolean };

function itemsTable(doc: Doc, items: PdfItem[], y: number): number {
  const cols = columns(doc, [
    { label: "No", w: 0.7 }, { label: "Uraian & spesifikasi", w: 6 }, { label: "Qty", w: 1, align: "right" }, { label: "Satuan", w: 1.2 },
    { label: "Harga satuan (Rp)", w: 2.2, align: "right" }, { label: "Jumlah (Rp)", w: 2.2, align: "right" },
  ]);
  return table(doc, cols, items.map((it, i) => [
    String(i + 1), { text: it.description, bold: true, sub: it.spec ?? undefined }, String(it.qty), it.unit, fmtNum(it.unitPrice), fmtNum(it.amount),
  ]), y);
}

export async function renderQuotation(d: QuotationPdf, o: Opts = {}): Promise<Buffer> {
  const doc = newDoc({ size: "A4", title: `Penawaran ${d.number}`, ...o });
  let y = header(doc, d.company, "PENAWARAN HARGA", [["Nomor", d.number], ["Tanggal", fmtDateFull(d.date)]]);
  y = partyBlock(doc, "Kepada Yth.", d.to, y) + 14;
  doc.font(F.bold).fontSize(9).fillColor(C.ink).text(`Perihal: ${d.subject}`, M, y, { width: doc.page.width - 2 * M });
  doc.font(F.reg).fontSize(9).text("Dengan hormat, bersama ini kami sampaikan penawaran harga sebagai berikut:", M, doc.y + 4);
  y = itemsTable(doc, d.items, doc.y + 12);
  y = totalsBlock(doc, d.totals, y + 12);
  y = terbilangBox(doc, terbilangRupiah(d.totals.total), y);
  y = termsTable(doc, d.terms, y);
  y = notesBlock(doc, d.notes, y);
  y = bankBlock(doc, d.company, y);
  signature(doc, d.company, y);
  footer(doc, `${d.company.name} · ${d.number}`);
  if (d.voided) watermark(doc, "DIBATALKAN");
  return toBuffer(doc);
}

export async function renderOrder(d: OrderPdf, o: Opts = {}): Promise<Buffer> {
  const doc = newDoc({ size: "A4", title: `Konfirmasi Order ${d.number}`, ...o });
  const meta: [string, string][] = [["Nomor", d.number], ["Tanggal", fmtDateFull(d.date)]];
  if (d.quotationNumber) meta.push(["Ref. penawaran", d.quotationNumber]);
  let y = header(doc, d.company, "KONFIRMASI ORDER", meta);
  const top = y;
  partyBlock(doc, "Pemesan", d.customer, top, 250);
  const left = doc.y;
  const info: [string, string][] = [
    ["Estimasi pengiriman", d.dueDate ? fmtDateFull(d.dueDate) : "[Belum ditentukan]"],
    ["Waktu pengerjaan", d.workDays ? `${d.workDays} hari kerja` : "[Belum ditentukan]"],
    ["Lokasi kirim", ph(d.deliveryLocation, "Alamat kirim")],
  ];
  let iy = top;
  for (const [l, v] of info) {
    doc.font(F.reg).fontSize(8).fillColor(C.muted).text(l, 330, iy, { width: 90, lineBreak: false });
    doc.font(F.bold).fontSize(8.5).fillColor(C.ink).text(v, 420, iy, { width: doc.page.width - M - 420, align: "right" });
    iy = Math.max(doc.y, iy + 13) + 3;
  }
  doc.font(F.reg).fontSize(9).fillColor(C.ink).text("Dengan ini kami konfirmasikan pesanan berikut:", M, Math.max(left, iy) + 14);
  y = itemsTable(doc, d.items, doc.y + 12);
  y = totalsBlock(doc, d.totals, y + 12);
  y = terbilangBox(doc, terbilangRupiah(d.totals.total), y);
  y = termsTable(doc, d.terms, y);
  y = notesBlock(doc, d.notes, y);
  y = bankBlock(doc, d.company, y);
  signature(doc, d.company, y, { left: true });
  footer(doc, `${d.company.name} · ${d.number}`);
  if (d.cancelled) watermark(doc, "DIBATALKAN");
  return toBuffer(doc);
}

export async function renderInvoice(d: InvoicePdf, o: Opts = {}): Promise<Buffer> {
  const doc = newDoc({ size: "A4", title: `Invoice ${d.number}`, ...o });
  const meta: [string, string][] = [["Nomor", d.number], ["Tanggal", fmtDateFull(d.date)], ["Jatuh tempo", fmtDateFull(d.dueDate)]];
  if (d.orderNumber) meta.push(["Ref. KO", d.orderNumber]);
  let y = header(doc, d.company, "INVOICE", meta);
  y = partyBlock(doc, "Ditagihkan kepada", d.customer, y) + 14;
  const cols = columns(doc, [
    { label: "No", w: 0.7 }, { label: "Keterangan", w: 6 }, { label: "Nilai order (Rp)", w: 2.4, align: "right" },
    { label: "Termin", w: 1.3, align: "right" }, { label: "Jumlah (Rp)", w: 2.2, align: "right" },
  ]);
  y = table(doc, cols, [[
    "1", { text: d.description, bold: true, sub: d.detail ?? undefined }, fmtNum(d.orderValue),
    `${Number.isInteger(d.percent) ? d.percent : String(d.percent).replace(".", ",")}%`, fmtNum(d.totals.subtotal),
  ]], y);
  const extra: [string, string][] = d.paid > 0
    ? [["Sudah dibayar", `Rp ${fmtNum(d.paid)}`], ["Sisa tagihan", `Rp ${fmtNum(Math.max(0, d.totals.total - d.paid))}`]]
    : [];
  y = totalsBlock(doc, d.totals, y + 12, "Total tagihan", extra);
  y = terbilangBox(doc, terbilangRupiah(d.totals.total), y);
  y = termsTable(
    doc,
    d.terms.map((t) => ({ ...t, label: t.current ? `${t.label} (invoice ini)` : t.label, trigger: t.note })),
    y, "Posisi termin order",
  );
  y = bankBlock(doc, d.company, y, "Cantumkan nomor invoice pada berita transfer.");
  signature(doc, d.company, y);
  footer(doc, `${d.company.name} · ${d.number}`);
  if (d.voided) watermark(doc, "DIBATALKAN");
  return toBuffer(doc);
}

export async function renderReceipt(d: ReceiptPdf, o: Opts = {}): Promise<Buffer> {
  const doc = newDoc({ size: "A5", landscape: true, title: `Kwitansi ${d.number}`, ...o });
  let y = header(doc, d.company, "KWITANSI", [["Nomor", d.number], ["Tanggal", fmtDateFull(d.date)]]) - 6;
  const rows: [string, string, boolean][] = [
    ["Telah terima dari", d.receivedFrom, true],
    ["Uang sejumlah", `# ${terbilangRupiah(d.amount)} #`, true],
    ["Untuk pembayaran", d.purpose, false],
    ["Cara bayar", `${d.methodLabel}, ${fmtDateFull(d.date)}`, false],
    ["Sisa tagihan invoice", `Rp ${fmtNum(d.balanceAfter)}`, false],
  ];
  const w = doc.page.width - 2 * M;
  for (const [label, value, bold] of rows) {
    doc.font(F.reg).fontSize(8.5).fillColor(C.muted).text(label, M, y + 8, { width: 110, lineBreak: false });
    doc.font(bold ? F.bold : F.reg).fontSize(9).fillColor(C.ink).text(value, M + 120, y + 8, { width: w - 120 });
    const next = Math.max(doc.y, y + 8 + 11) + 8;
    doc.moveTo(M, next).lineTo(doc.page.width - M, next).lineWidth(0.5).strokeColor(C.line).stroke();
    y = next;
  }
  const by = doc.page.height - M - 14 - 56;
  doc.roundedRect(M, by, 170, 56, 5).fillColor(C.ink).fill();
  doc.font(F.reg).fontSize(7.5).fillColor("#a1a1aa").text("Jumlah", M + 12, by + 9, { lineBreak: false });
  doc.font(F.bold).fontSize(17).fillColor(C.white).text(`Rp ${fmtNum(d.amount)}`, M + 12, by + 24, { lineBreak: false });
  const sx = doc.page.width - M - 170;
  const city = d.company.city?.trim() ? d.company.city.trim() : "[Kota]";
  doc.font(F.reg).fontSize(8.5).fillColor(C.ink).text(`${city}, ${fmtDateFull(d.date)}`, sx, by - 12, { width: 170, align: "center", lineBreak: false });
  doc.moveTo(sx, by + 34).lineTo(sx + 170, by + 34).lineWidth(0.8).strokeColor(C.ink).stroke();
  doc.font(F.bold).fontSize(9).text(ph(d.company.signatoryName, "Nama penerima"), sx, by + 38, { width: 170, align: "center", lineBreak: false });
  doc.font(F.reg).fontSize(8).fillColor(C.muted).text(d.company.name, sx, by + 50, { width: 170, align: "center", lineBreak: false });
  footer(doc, `${d.company.name} · ${d.number}`);
  if (d.voided) watermark(doc, "DIBATALKAN");
  return toBuffer(doc);
}
