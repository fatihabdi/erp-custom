import { describe, expect, it } from "vitest";
import {
  bomRequirement, findShortages, kindAllowed, signedDelta, stockStatus, validateBomLines, StockRuleError,
  countDifference, parseMoneyInput, parseMovementDate, validateMovementDate, weightedAverageCost,
} from "../stock";

describe("signedDelta", () => {
  it("masuk positif, keluar negatif", () => {
    expect(signedDelta("MASUK", 5)).toBe(5);
    expect(signedDelta("PRODUKSI_MASUK", 2)).toBe(2);
    expect(signedDelta("KELUAR", 5)).toBe(-5);
    expect(signedDelta("KIRIM", 3)).toBe(-3);
    expect(signedDelta("PEMAKAIAN_BAHAN", 1.5)).toBe(-1.5);
  });
  it("penyesuaian mengikuti tanda masukan", () => {
    expect(signedDelta("PENYESUAIAN", -1)).toBe(-1);
    expect(signedDelta("PENYESUAIAN", 4)).toBe(4);
  });
  it("menolak nol, negatif (non-penyesuaian), dan NaN", () => {
    expect(() => signedDelta("MASUK", 0)).toThrow(StockRuleError);
    expect(() => signedDelta("MASUK", -2)).toThrow(StockRuleError);
    expect(() => signedDelta("PENYESUAIAN", 0)).toThrow(StockRuleError);
    expect(() => signedDelta("MASUK", NaN)).toThrow(StockRuleError);
    expect(() => signedDelta("MASUK", 0.0001)).toThrow(StockRuleError);
  });
});

describe("kindAllowed", () => {
  it("QC dan pengiriman hanya barang jadi; pemakaian hanya bahan baku", () => {
    expect(kindAllowed("PRODUKSI_MASUK", "FINISHED")).toBe(true);
    expect(kindAllowed("PRODUKSI_MASUK", "RAW")).toBe(false);
    expect(kindAllowed("KIRIM", "RAW")).toBe(false);
    expect(kindAllowed("PEMAKAIAN_BAHAN", "FINISHED")).toBe(false);
    expect(kindAllowed("MASUK", "RAW")).toBe(true);
  });
});

describe("stockStatus", () => {
  it("habis, menipis, aman", () => {
    expect(stockStatus(0, 3)).toBe("HABIS");
    expect(stockStatus(8, 20)).toBe("MENIPIS");
    expect(stockStatus(20, 20)).toBe("AMAN");
    expect(stockStatus(34, 20)).toBe("AMAN");
    expect(stockStatus(1, 0)).toBe("AMAN");
  });
});

describe("BOM", () => {
  const lines = [
    { materialId: "besi", qty: 2.5 },
    { materialId: "kayu", qty: 0.3333 },
  ];
  it("menghitung kebutuhan bahan dan membulatkan ke atas", () => {
    expect(bomRequirement(lines, 4)).toEqual([
      { materialId: "besi", qty: 10 },
      { materialId: "kayu", qty: 1.334 },
    ]);
    expect(bomRequirement(lines, 1)[1].qty).toBe(0.334);
  });
  it("menolak jumlah produksi nol", () => {
    expect(() => bomRequirement(lines, 0)).toThrow(StockRuleError);
  });
  it("melaporkan semua kekurangan sekaligus", () => {
    const req = bomRequirement(lines, 4);
    const s = findShortages(req, new Map([["besi", 6]]));
    expect(s).toEqual([
      { materialId: "besi", needed: 10, available: 6, missing: 4 },
      { materialId: "kayu", needed: 1.334, available: 0, missing: 1.334 },
    ]);
    expect(findShortages(req, new Map([["besi", 10], ["kayu", 2]]))).toEqual([]);
  });
  it("validasi baris BOM", () => {
    expect(() => validateBomLines([{ materialId: "a", qty: 1 }, { materialId: "a", qty: 2 }])).toThrow(StockRuleError);
    expect(() => validateBomLines([{ materialId: "a", qty: 0 }])).toThrow(StockRuleError);
    expect(() => validateBomLines([{ materialId: "a", qty: 1 }])).not.toThrow();
  });
});

describe("weightedAverageCost", () => {
  it("merata-ratakan dengan stok lama", () => {
    expect(weightedAverageCost(10, 100, 10, 200)).toBe(150);
    expect(weightedAverageCost(3, 10, 1, 14)).toBe(11);
  });
  it("stok lama kosong atau negatif mengikuti harga beli", () => {
    expect(weightedAverageCost(0, 999, 5, 20)).toBe(20);
    expect(weightedAverageCost(-2, 999, 5, 20)).toBe(20);
  });
  it("menolak harga atau jumlah tidak valid", () => {
    expect(() => weightedAverageCost(1, 1, 0, 5)).toThrow(StockRuleError);
    expect(() => weightedAverageCost(1, 1, 1, -5)).toThrow(StockRuleError);
  });
});

describe("tanggal mutasi", () => {
  const now = new Date("2026-11-27T06:00:00Z");
  it("kosong atau hari ini = sekarang", () => {
    expect(parseMovementDate("", now)).toBeUndefined();
    expect(parseMovementDate("2026-11-27", now)).toBeUndefined();
  });
  it("tanggal lain dicatat pukul 12.00 WIB", () => {
    expect(parseMovementDate("2026-11-20", now)?.toISOString()).toBe("2026-11-20T05:00:00.000Z");
  });
  it("menolak format salah", () => {
    expect(() => parseMovementDate("20/11/2026", now)).toThrow(StockRuleError);
  });
  it("menolak tanggal masa depan", () => {
    expect(() => validateMovementDate(new Date("2026-12-05T00:00:00Z"), now)).toThrow(StockRuleError);
    expect(() => validateMovementDate(new Date("2026-11-26T00:00:00Z"), now)).not.toThrow();
  });
});

describe("countDifference (stok opname)", () => {
  it("selisih = hitung fisik - tercatat", () => {
    expect(countDifference(20, 18)).toBe(-2);
    expect(countDifference(1.5, 2)).toBe(0.5);
  });
  it("menolak tanpa selisih dan hasil negatif", () => {
    expect(() => countDifference(5, 5)).toThrow(StockRuleError);
    expect(() => countDifference(5, -1)).toThrow(StockRuleError);
  });
});

describe("parseMoneyInput", () => {
  it("memahami pemisah ribuan dan koma desimal", () => {
    expect(parseMoneyInput("15.000")).toBe(15000);
    expect(parseMoneyInput("1.250.000,50")).toBe(1250000.5);
    expect(parseMoneyInput("12,5")).toBe(12.5);
    expect(parseMoneyInput("15000")).toBe(15000);
    expect(Number.isNaN(parseMoneyInput("abc"))).toBe(true);
  });
});
