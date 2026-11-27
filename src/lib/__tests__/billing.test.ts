import { describe, expect, it } from "vitest";
import {
  allocateByPercent, DEFAULT_TERMS, DocumentRuleError, isOverdue, noteLines, orderAmounts, paymentPurpose, paymentState, sisaTagihan,
  termAmounts, validatePayment, validateTerms, TERM_PRESETS,
} from "../billing";
import { wibParts } from "../doc-number";
import { checkLogo } from "../logo";

describe("termin pembayaran", () => {
  it("skema bawaan dan preset sah (100%)", () => {
    for (const p of [{ name: "bawaan", terms: DEFAULT_TERMS }, ...TERM_PRESETS]) expect(() => validateTerms(p.terms)).not.toThrow();
  });
  it("menolak total bukan 100%, persen nol, kosong, dan isian kosong", () => {
    const t = (percent: number) => ({ label: "A", trigger: "x", percent, dueDays: 7 });
    expect(() => validateTerms([])).toThrow(DocumentRuleError);
    expect(() => validateTerms([t(30), t(60)])).toThrow(/100%/);
    expect(() => validateTerms([t(0), t(100)])).toThrow();
    expect(() => validateTerms([t(50), t(50.5)])).toThrow();
    expect(() => validateTerms([{ ...t(100), label: " " }])).toThrow();
    expect(() => validateTerms([{ ...t(100), trigger: "" }])).toThrow();
    expect(() => validateTerms([{ ...t(100), dueDays: -1 }])).toThrow();
    expect(() => validateTerms([t(33.33), t(33.33), t(33.34)])).not.toThrow();
  });
  it("pembagian selalu menjumlah ke total, sisa pembulatan di termin terakhir", () => {
    expect(allocateByPercent(10_000, [33.33, 33.33, 33.34]).reduce((a, b) => a + b, 0)).toBe(10_000);
    expect(allocateByPercent(100, [33, 33, 34])).toEqual([33, 33, 34]);
    expect(allocateByPercent(1, [50, 50])).toEqual([1, 0]);
    expect(allocateByPercent(1_000_001, [25, 25, 25, 25]).reduce((a, b) => a + b, 0)).toBe(1_000_001);
  });
});

describe("nilai order dan termin", () => {
  // Contoh penawaran SBA: 27.300.000 + PPN 11% = 30.303.000; DP 30% = 9.090.900.
  const sba = orderAmounts([{ qty: 12, unitPrice: 1_650_000 }, { qty: 3, unitPrice: 2_500_000 }], 11);
  it("SBA memakai PPN 11%", () => {
    expect(sba).toEqual({ subtotal: 27_300_000, ppn: 3_003_000, total: 30_303_000 });
  });
  it("GTF tanpa PPN", () => {
    expect(orderAmounts([{ qty: 10, unitPrice: 1_850_000 }], 0)).toEqual({ subtotal: 18_500_000, ppn: 0, total: 18_500_000 });
  });
  it("DP 30% / pelunasan 70% sesuai contoh PDF", () => {
    const [dp, lunas] = termAmounts(sba, [30, 70]);
    expect(dp).toEqual({ subtotal: 8_190_000, ppn: 900_900, total: 9_090_900 });
    expect(lunas.total).toBe(21_212_100);
    expect(dp.total + lunas.total).toBe(sba.total);
  });
  it("jumlah semua invoice = total order walau pembagian tidak habis", () => {
    const o = orderAmounts([{ qty: 1, unitPrice: 1_000_001 }, { qty: 3, unitPrice: 333_333 }], 11);
    for (const pcts of [[30, 70], [25, 25, 25, 25], [33.33, 33.33, 33.34], [10, 20, 30, 40], [100]]) {
      const parts = termAmounts(o, pcts);
      expect(Math.round(parts.reduce((n, p) => n + p.total * 100, 0))).toBe(Math.round(o.total * 100));
      expect(Math.round(parts.reduce((n, p) => n + p.ppn * 100, 0))).toBe(Math.round(o.ppn * 100));
    }
  });
  it("harga berkoma tidak menimbulkan selisih floating point", () => {
    expect(orderAmounts([{ qty: 3, unitPrice: 0.1 }], 0).subtotal).toBe(0.3);
  });
});

describe("pembayaran", () => {
  it("status bayar", () => {
    expect(paymentState(9_090_900, 0)).toBe("BELUM");
    expect(paymentState(9_090_900, 5_000_000)).toBe("SEBAGIAN");
    expect(paymentState(9_090_900, 9_090_900)).toBe("LUNAS");
    expect(sisaTagihan(9_090_900, 5_000_000)).toBe(4_090_900);
    expect(sisaTagihan(100, 150)).toBe(0);
  });
  it("sebagian lalu pelunasan sisa", () => {
    expect(() => validatePayment(9_090_900, 0, 5_000_000)).not.toThrow();
    expect(() => validatePayment(9_090_900, 5_000_000, 4_090_900)).not.toThrow();
  });
  it("menolak nol, negatif, NaN, dan kelebihan bayar", () => {
    expect(() => validatePayment(1000, 0, 0)).toThrow(DocumentRuleError);
    expect(() => validatePayment(1000, 0, -5)).toThrow();
    expect(() => validatePayment(1000, 0, NaN)).toThrow();
    expect(() => validatePayment(1000, 600, 401)).toThrow(/melebihi sisa/);
    expect(() => validatePayment(1000, 1000, 1)).toThrow();
  });
  it("lewat jatuh tempo mengikuti hari WIB dan hanya bila belum lunas", () => {
    const due = new Date("2026-11-20T00:00:00+07:00");
    expect(isOverdue(due, "BELUM", new Date("2026-11-20T23:00:00+07:00"))).toBe(false);
    expect(isOverdue(due, "BELUM", new Date("2026-11-21T00:30:00+07:00"))).toBe(true);
    expect(isOverdue(due, "SEBAGIAN", new Date("2026-12-01T00:00:00+07:00"))).toBe(true);
    expect(isOverdue(due, "LUNAS", new Date("2026-12-01T00:00:00+07:00"))).toBe(false);
  });
  it("keterangan kwitansi", () => {
    expect(paymentPurpose({ termLabel: "DP", percent: 30, invoiceNumber: "SBA-018/INV/XI/2026", partial: true })).toBe("Sebagian DP 30%, invoice SBA-018/INV/XI/2026");
    expect(paymentPurpose({ termLabel: "Lunas", percent: 33.33, invoiceNumber: "X", partial: false })).toBe("Lunas 33,33%, invoice X");
  });
  it("catatan satu per baris", () => {
    expect(noteLines("a\n\n  b \r\nc")).toEqual(["a", "b", "c"]);
    expect(noteLines(null)).toEqual([]);
  });
});

describe("tanggal nomor dokumen (WIB)", () => {
  it("server UTC tidak menggeser tanggal atau bulan", () => {
    expect(wibParts(new Date("2026-10-31T18:00:00Z"))).toEqual({ day: 1, month: 11, year: 2026 }); // 01:00 WIB
    expect(wibParts(new Date("2026-12-31T17:30:00Z"))).toEqual({ day: 1, month: 1, year: 2027 });
    expect(wibParts(new Date("2026-11-18T16:59:00Z"))).toEqual({ day: 18, month: 11, year: 2026 });
  });
});

describe("logo", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);
  it("menerima PNG dan JPEG dari isi berkas", () => {
    expect(checkLogo(png)).toEqual({ ok: true, mime: "image/png" });
    expect(checkLogo(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toEqual({ ok: true, mime: "image/jpeg" });
  });
  it("menolak SVG, berkas kosong, dan terlalu besar", () => {
    expect(checkLogo(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")).ok).toBe(false);
    expect(checkLogo(new Uint8Array()).ok).toBe(false);
    expect(checkLogo(new Uint8Array(600 * 1024).fill(0xff)).ok).toBe(false);
  });
});
