import { describe, expect, it } from "vitest";
import {
  AssetRuleError, checkAssignable, checkEventDate, checkStatusChange, depreciation, dueState, fullMonths, parseDay, validateAssetValues, wibDay,
} from "../asset";

const d = (s: string) => parseDay(s)!;

describe("tanggal", () => {
  it("parseDay menolak format dan tanggal tidak valid", () => {
    expect(parseDay("2026-11-27")?.toISOString()).toBe("2026-11-27T00:00:00.000Z");
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("27/11/2026")).toBeNull();
    expect(parseDay("")).toBeNull();
  });
  it("wibDay memakai hari kalender WIB", () => {
    expect(wibDay(new Date("2026-11-26T18:00:00Z")).toISOString()).toBe("2026-11-27T00:00:00.000Z");
    expect(wibDay(new Date("2026-11-26T16:59:00Z")).toISOString()).toBe("2026-11-26T00:00:00.000Z");
  });
  it("fullMonths menghitung bulan penuh", () => {
    expect(fullMonths(d("2026-01-15"), d("2026-02-14"))).toBe(0);
    expect(fullMonths(d("2026-01-15"), d("2026-02-15"))).toBe(1);
    expect(fullMonths(d("2025-11-30"), d("2026-11-29"))).toBe(11);
    expect(fullMonths(d("2026-05-01"), d("2026-01-01"))).toBe(0);
  });
});

describe("penyusutan garis lurus", () => {
  const base = { cost: 120_000_000, salvage: 12_000_000, lifeMonths: 96, acquiredAt: d("2024-01-10") };
  it("menyusut per bulan penuh", () => {
    const r = depreciation({ ...base, asOf: d("2026-01-10") }); // 24 bulan
    expect(r.months).toBe(24);
    expect(r.monthly).toBe(1_125_000);
    expect(r.accumulated).toBe(27_000_000);
    expect(r.bookValue).toBe(93_000_000);
    expect(r.fullyDepreciated).toBe(false);
  });
  it("belum menyusut sebelum genap sebulan", () => {
    expect(depreciation({ ...base, asOf: d("2024-02-09") })).toMatchObject({ months: 0, accumulated: 0, bookValue: 120_000_000 });
  });
  it("berhenti di nilai sisa setelah umur manfaat habis", () => {
    const r = depreciation({ ...base, asOf: d("2040-01-01") });
    expect(r.months).toBe(96);
    expect(r.bookValue).toBe(12_000_000);
    expect(r.fullyDepreciated).toBe(true);
  });
  it("pembulatan tidak menyisakan selisih sen", () => {
    const r = depreciation({ cost: 100_000, salvage: 0, lifeMonths: 3, acquiredAt: d("2026-01-01"), asOf: d("2026-03-01") });
    expect(r.accumulated).toBe(66_666.66);
    expect(r.bookValue).toBe(33_333.34);
    expect(depreciation({ cost: 100_000, salvage: 0, lifeMonths: 3, acquiredAt: d("2026-01-01"), asOf: d("2026-04-01") }).bookValue).toBe(0);
  });
  it("umur manfaat 0 berarti tidak disusutkan", () => {
    const r = depreciation({ cost: 5_000_000, salvage: 0, lifeMonths: 0, acquiredAt: d("2020-01-01"), asOf: d("2026-01-01") });
    expect(r).toMatchObject({ depreciable: false, accumulated: 0, bookValue: 5_000_000 });
  });
  it("aset yang dilepas disusutkan sampai tanggal pelepasan saja", () => {
    const r = depreciation({ ...base, disposedAt: d("2025-01-10"), asOf: d("2030-01-01") });
    expect(r.months).toBe(12);
    expect(r.bookValue).toBe(106_500_000);
  });
});

describe("jadwal perawatan", () => {
  const today = d("2026-11-27");
  it("terlambat, segera, atau tidak ada", () => {
    expect(dueState(d("2026-11-26"), today)).toBe("TERLAMBAT");
    expect(dueState(d("2026-11-27"), today)).toBe("SEGERA");
    expect(dueState(d("2026-12-27"), today)).toBe("SEGERA");
    expect(dueState(d("2026-12-28"), today)).toBeNull();
    expect(dueState(null, today)).toBeNull();
  });
});

describe("aturan", () => {
  it("status akhir terkunci dan penjualan lewat pelepasan", () => {
    expect(() => checkStatusChange("DIJUAL", "AKTIF")).toThrow(AssetRuleError);
    expect(() => checkStatusChange("AKTIF", "DIJUAL")).toThrow(/Lepas aset/);
    expect(() => checkStatusChange("RUSAK", "PERAWATAN")).not.toThrow();
  });
  it("hanya aset aktif yang bisa ditugaskan", () => {
    expect(() => checkAssignable("AKTIF")).not.toThrow();
    for (const s of ["PERAWATAN", "RUSAK", "DIJUAL", "DIHAPUSKAN"] as const) expect(() => checkAssignable(s)).toThrow(AssetRuleError);
  });
  it("nilai aset divalidasi", () => {
    expect(() => validateAssetValues({ cost: 100, salvage: 101, lifeMonths: 12 })).toThrow(/Nilai sisa/);
    expect(() => validateAssetValues({ cost: -1, salvage: 0, lifeMonths: 12 })).toThrow(AssetRuleError);
    expect(() => validateAssetValues({ cost: 100, salvage: 0, lifeMonths: 1.5 })).toThrow(/Umur manfaat/);
    expect(() => validateAssetValues({ cost: 100, salvage: 10, lifeMonths: 0 })).not.toThrow();
  });
  it("tanggal kejadian tidak sebelum perolehan dan tidak di masa depan", () => {
    const today = d("2026-11-27");
    expect(() => checkEventDate(d("2026-01-01"), d("2026-02-01"), "Tanggal", today)).toThrow(/sebelum/);
    expect(() => checkEventDate(d("2026-12-01"), d("2026-02-01"), "Tanggal", today)).toThrow(/masa depan/);
    expect(() => checkEventDate(d("2026-11-27"), d("2026-02-01"), "Tanggal", today)).not.toThrow();
  });
});
