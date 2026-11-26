import PDFDocument from "pdfkit";
import { fmtDateFull, fmtNum } from "@/lib/format";
import type { PdfCompany, PdfTerm, PdfTotals } from "./types";

type Doc = InstanceType<typeof PDFDocument>;

// Gaya hitam putih netral, mengikuti desain PDF.
export const C = { ink: "#0a0a0a", muted: "#6b6b70", line: "#e4e4e7", fill: "#f4f4f5", white: "#ffffff" };
export const F = { reg: "Helvetica", bold: "Helvetica-Bold" };
export const M = 40; // margin halaman

export const ph = (v: string | null | undefined, label: string) => (v?.trim() ? v.trim() : `[${label}]`);

export function newDoc(opts: { size: "A4" | "A5"; landscape?: boolean; title: string; compress?: boolean }): Doc {
  const doc = new PDFDocument({
    size: opts.size, layout: opts.landscape ? "landscape" : "portrait", margin: M, bufferPages: true,
    compress: opts.compress ?? true, info: { Title: opts.title, Creator: "ERP Furniture" },
  });
  doc.font(F.reg).fontSize(9).fillColor(C.ink);
  return doc;
}

export function toBuffer(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

const right = (doc: Doc) => doc.page.width - M;
const bottom = (doc: Doc) => doc.page.height - M - 14; // ruang untuk footer

function roundedBox(doc: Doc, x: number, y: number, w: number, h: number, r: number) {
  doc.roundedRect(x, y, w, h, r);
}

/** Kop: logo, nama dan kontak perusahaan di kiri; judul dan metadata di kanan; garis hitam di bawah. Mengembalikan y berikutnya. */
export function header(doc: Doc, c: PdfCompany, title: string, meta: [string, string][]): number {
  const top = M;
  if (c.logo) {
    try { doc.image(c.logo, M, top, { fit: [44, 44] }); } catch { placeholderLogo(doc, c.code, top); }
  } else placeholderLogo(doc, c.code, top);
  const tx = M + 54;
  doc.font(F.bold).fontSize(11).fillColor(C.ink).text(c.name, tx, top + 2, { width: 250 });
  doc.font(F.reg).fontSize(7.5).fillColor(C.muted);
  doc.text(ph(c.address, "Alamat perusahaan"), tx, top + 17, { width: 250 });
  doc.text(`${ph(c.phone, "Telepon")} · ${ph(c.email, "Email")}`, tx, doc.y + 1, { width: 250 });
  const leftEnd = doc.y;

  doc.font(F.bold).fontSize(16).fillColor(C.ink).text(title, 280, top, { width: right(doc) - 280, align: "right" });
  let y = top + 26;
  for (const [label, value] of meta) {
    doc.font(F.reg).fontSize(7.5).fillColor(C.muted);
    const vw = doc.font(F.bold).fontSize(8).widthOfString(value);
    doc.font(F.reg).fontSize(7.5).fillColor(C.muted).text(label, 280, y + 0.5, { width: right(doc) - 280 - vw - 6, align: "right", lineBreak: false });
    doc.font(F.bold).fontSize(8).fillColor(C.ink).text(value, right(doc) - vw, y, { lineBreak: false });
    y += 13;
  }
  const lineY = Math.max(leftEnd, y, top + 50) + 8;
  doc.moveTo(M, lineY).lineTo(right(doc), lineY).lineWidth(1.2).strokeColor(C.ink).stroke();
  return lineY + 14;
}

function placeholderLogo(doc: Doc, code: string, top: number) {
  roundedBox(doc, M, top, 44, 44, 6);
  doc.lineWidth(0.7).dash(2, { space: 2 }).strokeColor(C.line).stroke().undash();
  doc.font(F.bold).fontSize(6.5).fillColor(C.muted).text(`LOGO ${code}`, M, top + 19, { width: 44, align: "center", lineBreak: false });
}

export function footer(doc: Doc, left: string) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - M + 2;
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // supaya teks footer tidak memicu halaman baru
    doc.moveTo(M, y - 6).lineTo(right(doc), y - 6).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.font(F.reg).fontSize(7).fillColor(C.muted).text(left, M, y, { lineBreak: false });
    const t = `Halaman ${i + 1} dari ${range.count}`;
    doc.text(t, right(doc) - doc.widthOfString(t), y, { lineBreak: false });
    doc.page.margins.bottom = saved;
  }
}

/** Cap diagonal untuk dokumen batal. */
export function watermark(doc: Doc, text: string) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.save();
    doc.rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] });
    doc.font(F.bold).fontSize(64).fillColor("#d4d4d8").fillOpacity(0.55)
      .text(text, 0, doc.page.height / 2 - 30, { width: doc.page.width, align: "center", lineBreak: false });
    doc.restore();
  }
}

export type Col = { label: string; x: number; w: number; align?: "left" | "right" | "center" };

/** Kolom tabel yang lebarnya memenuhi area isi: `weights` menentukan perbandingan, `fixed` lebar tetap. */
export function columns(doc: Doc, defs: { label: string; w: number; align?: Col["align"] }[]): Col[] {
  const total = right(doc) - M;
  const sum = defs.reduce((n, d) => n + d.w, 0);
  let x = M;
  return defs.map((d) => {
    const w = (d.w / sum) * total;
    const col = { label: d.label, x, w, align: d.align };
    x += w;
    return col;
  });
}

export function tableHead(doc: Doc, cols: Col[], y: number): number {
  doc.rect(M, y, right(doc) - M, 22).fillColor(C.fill).fill();
  doc.font(F.bold).fontSize(8).fillColor(C.ink);
  for (const c of cols) doc.text(c.label, c.x + 6, y + 7, { width: c.w - 12, align: c.align ?? "left", lineBreak: false });
  doc.moveTo(M, y + 22).lineTo(right(doc), y + 22).lineWidth(1).strokeColor(C.ink).stroke();
  return y + 22;
}

export type Cell = string | { text: string; bold?: boolean; sub?: string };

/** Tabel dengan baris tinggi menyesuaikan isi dan kepala berulang di halaman baru. */
export function table(doc: Doc, cols: Col[], rows: Cell[][], y: number): number {
  y = tableHead(doc, cols, y);
  for (const row of rows) {
    const heights = row.map((cell, i) => {
      const c = typeof cell === "string" ? { text: cell } : cell;
      doc.font(c.bold ? F.bold : F.reg).fontSize(9);
      let h = doc.heightOfString(c.text || " ", { width: cols[i].w - 12 });
      if (c.sub) { doc.font(F.reg).fontSize(7.5); h += 2 + doc.heightOfString(c.sub, { width: cols[i].w - 12 }); }
      return h;
    });
    const rh = Math.max(...heights) + 14;
    if (y + rh > bottom(doc)) {
      doc.addPage();
      y = tableHead(doc, cols, M);
    }
    row.forEach((cell, i) => {
      const c = typeof cell === "string" ? { text: cell } : cell;
      const col = cols[i];
      doc.font(c.bold ? F.bold : F.reg).fontSize(9).fillColor(C.ink).text(c.text, col.x + 6, y + 7, { width: col.w - 12, align: col.align ?? "left" });
      if (c.sub) doc.font(F.reg).fontSize(7.5).fillColor(C.muted).text(c.sub, col.x + 6, doc.y + 2, { width: col.w - 12, align: col.align ?? "left" });
    });
    doc.moveTo(M, y + rh).lineTo(right(doc), y + rh).lineWidth(0.5).strokeColor(C.line).stroke();
    y += rh;
  }
  return y;
}

/** Kebutuhan tinggi ruang; pindah halaman bila tidak muat. */
export function ensure(doc: Doc, y: number, h: number): number {
  if (y + h > bottom(doc)) { doc.addPage(); return M; }
  return y;
}

/** Blok jumlah di kanan: Jumlah, PPN, lalu batang hitam Total (atau label lain). */
export function totalsBlock(doc: Doc, t: PdfTotals, y: number, totalLabel = "Total", extra: [string, string][] = []): number {
  const w = 220;
  const x = right(doc) - w;
  y = ensure(doc, y, 90 + extra.length * 16);
  const row = (label: string, value: string) => {
    doc.font(F.reg).fontSize(8.5).fillColor(C.muted).text(label, x + 8, y + 4, { width: 100, lineBreak: false });
    doc.fillColor(C.ink).text(value, x + 8, y + 4, { width: w - 16, align: "right", lineBreak: false });
    y += 16;
  };
  row("Jumlah", `Rp ${fmtNum(t.subtotal)}`);
  if (t.ppnRate > 0) row(`PPN ${t.ppnRate}%`, `Rp ${fmtNum(t.ppn)}`);
  doc.rect(x, y + 2, w, 26).fillColor(C.ink).fill();
  doc.font(F.bold).fontSize(9.5).fillColor(C.white).text(totalLabel, x + 8, y + 10, { width: 100, lineBreak: false });
  doc.text(`Rp ${fmtNum(t.total)}`, x + 8, y + 10, { width: w - 16, align: "right", lineBreak: false });
  y += 34;
  for (const [l, v] of extra) row(l, v);
  return y;
}

export function terbilangBox(doc: Doc, text: string, y: number): number {
  y = ensure(doc, y + 8, 44);
  roundedBox(doc, M, y, right(doc) - M, 38, 5);
  doc.lineWidth(0.7).strokeColor(C.line).stroke();
  doc.font(F.reg).fontSize(7.5).fillColor(C.muted).text("Terbilang", M + 10, y + 7, { lineBreak: false });
  doc.font(F.bold).fontSize(9).fillColor(C.ink).text(`# ${text} #`, M + 10, y + 19, { width: right(doc) - M - 20, lineBreak: false });
  return y + 38;
}

export function sectionTitle(doc: Doc, text: string, y: number): number {
  y = ensure(doc, y, 40);
  doc.font(F.bold).fontSize(9).fillColor(C.ink).text(text, M, y, { lineBreak: false });
  return y + 14;
}

export function termsTable(doc: Doc, terms: PdfTerm[], y: number, head = "Termin pembayaran", trigHead = "Pemicu / jatuh tempo"): number {
  y = sectionTitle(doc, head, y + 14);
  const cols = columns(doc, [
    { label: "Termin", w: 2 }, { label: trigHead, w: 5 }, { label: "%", w: 1, align: "right" }, { label: "Nominal (Rp)", w: 2, align: "right" },
  ]);
  return table(doc, cols, terms.map((t) => [t.label, t.trigger, String(Number.isInteger(t.percent) ? t.percent : t.percent.toString().replace(".", ",")), fmtNum(t.amount)]), y);
}

export function bankBlock(doc: Doc, c: PdfCompany, y: number, extra?: string): number {
  y = sectionTitle(doc, "Pembayaran ditransfer ke", y + 14);
  doc.font(F.reg).fontSize(8.5).fillColor(C.muted)
    .text(`${ph(c.bankName, "Nama bank")} · ${ph(c.bankAccount, "Nomor rekening")} a.n. ${ph(c.bankHolder ?? c.name, "Pemilik rekening")}`, M, y, { width: right(doc) - M });
  if (extra) doc.text(extra, M, doc.y + 2, { width: right(doc) - M });
  return doc.y;
}

export function notesBlock(doc: Doc, notes: string[], y: number): number {
  if (notes.length === 0) return y;
  y = sectionTitle(doc, "Catatan", y + 14);
  doc.font(F.reg).fontSize(8.5).fillColor(C.muted);
  for (const n of notes) {
    y = ensure(doc, y, 14);
    doc.text(`•  ${n}`, M, y, { width: right(doc) - M });
    y = doc.y + 2;
  }
  return y;
}

/**
 * Tanda tangan di kanan bawah. `left` menambah kolom persetujuan pemesan (Konfirmasi Order).
 */
export function signature(doc: Doc, c: PdfCompany, y: number, opts: { left?: boolean } = {}): void {
  const h = 120;
  let top = Math.max(y + 28, doc.page.height - M - 14 - h - 20);
  if (top + h > bottom(doc)) { doc.addPage(); top = Math.max(M + 20, doc.page.height - M - 14 - h - 20); }
  const w = 190;
  const rx = right(doc) - w;
  doc.font(F.reg).fontSize(9).fillColor(C.ink).text("Hormat kami,", rx, top, { width: w, align: "center" });
  const ly = top + 76;
  doc.moveTo(rx, ly).lineTo(rx + w, ly).lineWidth(0.8).strokeColor(C.ink).stroke();
  doc.font(F.bold).fontSize(9).text(ph(c.signatoryName, "Nama penandatangan"), rx, ly + 5, { width: w, align: "center" });
  doc.font(F.reg).fontSize(8).fillColor(C.muted).text(c.signatoryTitle?.trim() || (opts.left ? c.name : "[Jabatan]"), rx, doc.y + 1, { width: w, align: "center" });
  if (opts.left) {
    doc.font(F.reg).fontSize(9).fillColor(C.ink).text("Menyetujui, Pemesan", M, top, { width: w, align: "center" });
    doc.moveTo(M, ly).lineTo(M + w, ly).lineWidth(0.8).strokeColor(C.ink).stroke();
    doc.font(F.reg).fontSize(9).text("(................................)", M, ly + 5, { width: w, align: "center" });
    doc.font(F.reg).fontSize(8).fillColor(C.muted).text("Nama, jabatan, stempel", M, doc.y + 1, { width: w, align: "center" });
  }
}

export function partyBlock(doc: Doc, label: string, p: { name: string; attn: string | null; address: string | null }, y: number, width = 280): number {
  doc.font(F.reg).fontSize(8).fillColor(C.muted).text(label, M, y, { lineBreak: false });
  doc.font(F.bold).fontSize(10).fillColor(C.ink).text(p.name, M, y + 12, { width });
  if (p.attn) doc.font(F.reg).fontSize(8.5).fillColor(C.muted).text(`u.p. ${p.attn}`, M, doc.y + 1, { width });
  doc.font(F.reg).fontSize(8.5).fillColor(C.muted).text(ph(p.address, "Alamat pelanggan"), M, doc.y + 1, { width });
  return doc.y;
}

export { fmtDateFull, fmtNum };
export type { Doc };
