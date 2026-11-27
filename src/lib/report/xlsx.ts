import ExcelJS from "exceljs";
import { cellText } from "./cell";
import type { Cell, ReportData } from "./types";

const FMT = { rp: '#,##0;[Red]-#,##0', int: "#,##0", pct: '0.0"%"', date: "dd/mm/yyyy" } as const;
const INK = "FF0A0A0A";

/** Tanggal disimpan sebagai hari kalender WIB (Excel tidak mengenal zona waktu). */
const wibDay = (d: Date) => new Date(d.getTime() + 7 * 3600_000);

function excelValue(v: Cell | undefined, type: string | undefined): ExcelJS.CellValue {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return wibDay(v);
  if (typeof v === "number" && type !== "text") return v;
  return typeof v === "number" ? cellText(v) : v;
}

/** Satu lembar kerja per laporan: judul, ringkasan, lalu tiap bagian berurutan ke bawah. */
export async function renderXlsx(r: ReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ERP Furniture";
  wb.created = new Date();
  const ws = wb.addWorksheet(r.title.slice(0, 31), { views: [{ showGridLines: false }] });

  const widest = Math.max(2, ...r.sections.map((s) => s.cols.length));
  let row = 1;
  ws.getCell(row, 1).value = r.title; ws.getCell(row, 1).font = { bold: true, size: 14 }; row++;
  ws.getCell(row, 1).value = `Perusahaan: ${r.scopeLabel}`; row++;
  if (r.periodLabel) { ws.getCell(row, 1).value = `Periode: ${r.periodLabel}`; row++; }
  row++;
  if (r.summary.length) {
    for (const s of r.summary) {
      ws.getCell(row, 1).value = s.label;
      const c = ws.getCell(row, 2);
      c.value = excelValue(typeof s.value === "number" ? s.value : s.value, s.type);
      if (s.type !== "text" && typeof s.value === "number") c.numFmt = FMT[s.type as keyof typeof FMT] ?? "General";
      c.alignment = { horizontal: "right" };
      row++;
    }
    row++;
  }

  for (const s of r.sections) {
    ws.getCell(row, 1).value = s.title; ws.getCell(row, 1).font = { bold: true, size: 12 }; row++;
    if (s.note) { ws.getCell(row, 1).value = s.note; ws.getCell(row, 1).font = { italic: true, color: { argb: "FF6B6B70" } }; row++; }
    s.cols.forEach((c, i) => {
      const cell = ws.getCell(row, i + 1);
      cell.value = c.label;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F5" } };
      cell.border = { bottom: { style: "medium", color: { argb: INK } } };
      cell.alignment = { horizontal: c.type && c.type !== "text" && c.type !== "date" ? "right" : "left" };
    });
    row++;
    if (s.rows.length === 0) { ws.getCell(row, 1).value = s.empty ?? "Tidak ada data."; row += 2; continue; }
    const put = (data: Record<string, Cell>, bold: boolean) => {
      s.cols.forEach((c, i) => {
        const cell = ws.getCell(row, i + 1);
        cell.value = excelValue(data[c.key], c.type);
        if (c.type && c.type !== "text") cell.numFmt = FMT[c.type];
        if (c.type === "date") cell.alignment = { horizontal: "left" };
        if (bold) { cell.font = { bold: true }; cell.border = { top: { style: "thin", color: { argb: INK } } }; }
      });
      row++;
    };
    for (const d of s.rows) put(d, false);
    if (s.totals) put(s.totals, true);
    row++;
  }

  // Lebar kolom menurut isi terpanjang, dibatasi agar tabel tetap terbaca.
  for (let i = 1; i <= widest; i++) {
    let w = 10;
    ws.getColumn(i).eachCell({ includeEmpty: false }, (c) => {
      const v = c.value;
      const len = v instanceof Date ? 12 : typeof v === "number" ? 16 : String(v ?? "").length;
      if (c.font?.size !== 14 && !(c.font?.italic)) w = Math.max(w, Math.min(len + 2, 44));
    });
    ws.getColumn(i).width = w;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
