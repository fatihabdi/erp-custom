import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { agingBucket, allocateToCategories, monthKey, monthLabel, parsePeriod, periodPresets, resolveScope, sumMoney, termKind } from "../report/filters";
import { cellText } from "../report/cell";
import { renderReportPdf } from "../report/pdf";
import { renderXlsx } from "../report/xlsx";
import type { ReportData } from "../report/types";

const NOW = new Date("2026-11-27T05:00:00Z"); // 27 Nov 2026 12:00 WIB

describe("periode laporan", () => {
  it("bawaan: 1 Januari tahun ini sampai hari ini (WIB), batas akhir termasuk", () => {
    const p = parsePeriod(undefined, undefined, NOW);
    expect(p.fromStr).toBe("2026-01-01");
    expect(p.toStr).toBe("2026-11-27");
    expect(p.from.toISOString()).toBe("2025-12-31T17:00:00.000Z");
    expect(p.toExclusive.toISOString()).toBe("2026-11-27T17:00:00.000Z");
  });
  it("tanggal terbalik ditukar, tanggal tidak valid diabaikan", () => {
    const p = parsePeriod("2026-03-10", "2026-02-01", NOW);
    expect([p.fromStr, p.toStr]).toEqual(["2026-02-01", "2026-03-10"]);
    expect(parsePeriod("2026-02-30", "bukan", NOW).fromStr).toBe("2026-01-01");
  });
  it("hari pertama dan terakhir ikut dihitung di zona WIB", () => {
    const p = parsePeriod("2026-11-01", "2026-11-30", NOW);
    // 1 Nov 00:00 WIB sudah masuk, 30 Nov 23:59 WIB masih masuk, 1 Des 00:00 WIB tidak.
    expect(new Date("2026-10-31T17:00:00Z") >= p.from).toBe(true);
    expect(new Date("2026-11-30T16:59:00Z") < p.toExclusive).toBe(true);
    expect(new Date("2026-11-30T17:00:00Z") < p.toExclusive).toBe(false);
  });
  it("pilihan cepat: bulan lalu di bulan Januari jatuh ke Desember tahun sebelumnya", () => {
    const jan = periodPresets(new Date("2027-01-15T05:00:00Z"));
    expect(jan.find((x) => x.label === "Bulan lalu")).toMatchObject({ dari: "2026-12-01", sampai: "2026-12-31" });
    expect(jan.find((x) => x.label === "Tahun lalu")).toMatchObject({ dari: "2026-01-01", sampai: "2026-12-31" });
  });
});

describe("perusahaan laporan", () => {
  const cos = [{ code: "SBA" }, { code: "GTF" }];
  it("Direktur: gabungan bawaan, bisa memilih satu perusahaan", () => {
    const all = resolveScope("DIREKTUR", cos);
    expect(all.combined).toBe(true);
    expect(all.selected.map((c) => c.code)).toEqual(["GTF", "SBA"]);
    expect(all.options.map((o) => o.label)).toEqual(["Gabungan", "GTF", "SBA"]);
    expect(resolveScope("DIREKTUR", cos, "SBA")).toMatchObject({ combined: false, value: "SBA" });
  });
  it("peran lain tidak pernah gabungan dan tidak bisa keluar dari perusahaannya", () => {
    const k = resolveScope("KEUANGAN", cos);
    expect(k.combined).toBe(false);
    expect(k.selected.map((c) => c.code)).toEqual(["GTF"]);
    expect(k.options.map((o) => o.label)).toEqual(["GTF", "SBA"]);
    const only = resolveScope("KEUANGAN", [{ code: "SBA" }], "GTF");
    expect(only.selected.map((c) => c.code)).toEqual(["SBA"]);
    expect(resolveScope("DIREKTUR", [{ code: "SBA" }]).combined).toBe(false);
    expect(resolveScope("KEUANGAN", []).selected).toEqual([]);
  });
});

describe("pengelompokan", () => {
  it("kelompok umur piutang", () => {
    expect([0, 30, 31, 60, 61, 90, 91, 400].map(agingBucket)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
  it("bulan WIB: 31 Okt 18:00 UTC sudah November", () => {
    expect(monthKey(new Date("2026-10-31T18:00:00Z"))).toBe("2026-11");
    expect(monthLabel("2026-11")).toBe("Nov 2026");
  });
  it("jenis termin ditebak dari nama", () => {
    expect(["DP", "Uang Muka", "dp 30%", "Termin 2", "Pelunasan", "Lunas"].map(termKind)).toEqual(["DP", "DP", "DP", "TERMIN", "PELUNASAN", "PELUNASAN"]);
    expect(termKind("Adopsi")).toBe("TERMIN");
  });
  it("jumlah uang per sen tanpa selisih desimal", () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
  });
  it("DPP dibagi ke kategori menurut nilai baris dan selalu cocok total", () => {
    const m = allocateToCategories(100, [{ category: "A", value: 1 }, { category: "B", value: 1 }, { category: "C", value: 1 }], "Lainnya");
    expect(sumMoney([...m.values()])).toBe(100);
    const n = allocateToCategories(9_090_900, [{ category: "Sekolah", value: 10_000_000 }, { category: "Kantor", value: 4_000_000 }, { category: "Sekolah", value: 1_000_000 }], "Lainnya");
    expect(n.get("Sekolah")! + n.get("Kantor")!).toBeCloseTo(9_090_900, 2);
    expect(n.get("Sekolah")!).toBeGreaterThan(n.get("Kantor")!);
  });
  it("tanpa nilai baris, seluruhnya masuk kategori cadangan", () => {
    expect([...allocateToCategories(500, [], "Lainnya")]).toEqual([["Lainnya", 500]]);
    expect([...allocateToCategories(500, [{ category: "A", value: 0 }], "Lainnya")]).toEqual([["Lainnya", 500]]);
  });
});

describe("teks sel", () => {
  it("rupiah negatif memakai minus, kosong jadi strip", () => {
    expect(cellText(-1500, "rp")).toBe("-Rp 1.500");
    expect(cellText(null, "rp")).toBe("-");
    expect(cellText(12.5, "pct")).toBe("12,5%");
    expect(cellText("x", "text")).toBe("x");
  });
});

describe("ekspor", () => {
  const data: ReportData = {
    slug: "penjualan", title: "Penjualan per periode", description: "x", scopeLabel: "Gabungan GTF + SBA", periodLabel: "1 Jan 2026 - 27 Nov 2026",
    summary: [{ label: "Penjualan (DPP)", value: 1_500_000, type: "rp", hint: "Tanpa PPN" }],
    sections: [
      {
        title: "Per bulan", cols: [{ key: "name", label: "Bulan", type: "text" }, { key: "dpp", label: "DPP", type: "rp" }, { key: "d", label: "Tanggal", type: "date" }],
        rows: [{ name: "Nov 2026", dpp: -1500.5, d: new Date("2026-11-27T05:00:00Z") }], totals: { name: "Total", dpp: -1500.5, d: null },
      },
      { title: "Kosong", cols: [{ key: "name", label: "Nama", type: "text" }], rows: [], empty: "Tidak ada." },
    ],
  };
  it("Excel: berkas xlsx dengan angka asli dan tanggal WIB", async () => {
    const buf = await renderXlsx(data);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    const ws = wb.worksheets[0];
    const cells: unknown[] = [];
    ws.eachRow((r) => r.eachCell((c) => cells.push(c.value)));
    expect(cells).toContain(1_500_000);
    expect(cells).toContain(-1500.5);
    expect(cells.some((c) => c instanceof Date && c.toISOString().startsWith("2026-11-27"))).toBe(true);
    expect(cells).toContain("Tidak ada.");
  });
  it("PDF: dokumen A4 mendatar yang valid", async () => {
    const buf = await renderReportPdf(data, NOW);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1500);
  });
});
