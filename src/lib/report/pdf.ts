import { fmtDateTime, fmtNum } from "@/lib/format";
import { C, columns, F, footer, M, newDoc, sectionTitle, table, toBuffer, type Cell as PdfCell } from "@/lib/pdf/kit";
import { cellText, isNumeric } from "./cell";
import type { Cell, ColType, ReportData } from "./types";

/** PDF A4 mendatar: kop laporan, kartu ringkasan sebagai baris teks, lalu tabel tiap bagian. */
export async function renderReportPdf(r: ReportData, now = new Date()): Promise<Buffer> {
  const doc = newDoc({ size: "A4", landscape: true, title: `${r.title} - ${r.scopeLabel}` });
  const width = doc.page.width - M * 2;
  doc.font(F.bold).fontSize(16).fillColor(C.ink).text(r.title, M, M, { width });
  doc.font(F.reg).fontSize(9).fillColor(C.muted).text(`Perusahaan: ${r.scopeLabel}${r.periodLabel ? `  ·  ${r.periodLabel}` : ""}`, M, doc.y + 2, { width });
  doc.text(`Dicetak ${fmtDateTime(now)}`, M, doc.y + 1, { width });
  let y = doc.y + 8;
  doc.moveTo(M, y).lineTo(M + width, y).lineWidth(1.2).strokeColor(C.ink).stroke();
  y += 12;

  if (r.summary.length) {
    const gap = 10;
    const w = (width - gap * (r.summary.length - 1)) / r.summary.length;
    r.summary.forEach((s, i) => {
      const x = M + i * (w + gap);
      doc.roundedRect(x, y, w, 46, 5).lineWidth(0.7).strokeColor(C.line).stroke();
      doc.font(F.reg).fontSize(7.5).fillColor(C.muted).text(s.label, x + 8, y + 7, { width: w - 16, lineBreak: false });
      doc.font(F.bold).fontSize(12).fillColor(C.ink).text(cellText(s.value, s.type), x + 8, y + 19, { width: w - 16, lineBreak: false });
      if (s.hint) doc.font(F.reg).fontSize(7).fillColor(C.muted).text(s.hint, x + 8, y + 35, { width: w - 16, lineBreak: false });
    });
    y += 58;
  }

  for (const s of r.sections) {
    y = sectionTitle(doc, s.title, y + 6);
    if (s.note) { doc.font(F.reg).fontSize(7.5).fillColor(C.muted).text(s.note, M, y - 2, { width }); y = doc.y + 6; }
    if (s.rows.length === 0) {
      doc.font(F.reg).fontSize(9).fillColor(C.muted).text(s.empty ?? "Tidak ada data.", M, y, { width });
      y = doc.y + 8;
      continue;
    }
    // Kolom rupiah memuat angka saja (satuan di judul kolom) supaya tidak terpotong ke baris kedua.
    const cols = columns(doc, s.cols.map((c) => ({
      label: c.type === "rp" ? `${c.label} (Rp)` : c.label, align: isNumeric(c.type) ? ("right" as const) : ("left" as const),
      w: c.type === "rp" ? 2.2 : c.type === "date" ? 1.8 : c.type === "int" ? 1.2 : c.type === "pct" ? 1.5 : 3,
    })));
    const text = (v: Cell | undefined, type: ColType | undefined) =>
      type === "rp" && typeof v === "number" ? (v < 0 ? `-${fmtNum(-v)}` : fmtNum(v)) : cellText(v, type);
    const rows: PdfCell[][] = s.rows.map((row) => s.cols.map((c) => text(row[c.key], c.type)));
    if (s.totals) rows.push(s.cols.map((c) => ({ text: text(s.totals![c.key], c.type), bold: true })));
    y = table(doc, cols, rows, y) + 8;
  }
  footer(doc, `${r.title} · ${r.scopeLabel}`);
  return toBuffer(doc);
}
