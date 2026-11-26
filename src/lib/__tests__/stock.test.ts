import { describe, expect, it } from "vitest";
import {
  bomRequirement, findShortages, kindAllowed, signedDelta, stockStatus, validateBomLines, StockRuleError,
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
