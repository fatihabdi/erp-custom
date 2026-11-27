import { describe, expect, it } from "vitest";
import { marginPercent, productSpecLines, productSpecText, ProductRuleError, validateProduct, type ProductInput } from "../product";
import { allowedModules, can, canSeeProductCost, ROLES } from "../permissions";

const ok: ProductInput = { name: "Meja siswa", category: "SEKOLAH", type: "PRODUKSI", unit: "unit", price: 1_500_000, cost: 900_000 };

describe("validasi produk", () => {
  it("menerima produk yang lengkap, harga 0 boleh (harga diisi menyusul)", () => {
    expect(() => validateProduct(ok)).not.toThrow();
    expect(() => validateProduct({ ...ok, price: 0, cost: 0 })).not.toThrow();
  });
  it("menolak nama atau satuan kosong dan harga negatif atau bukan angka", () => {
    expect(() => validateProduct({ ...ok, name: "  " })).toThrow(ProductRuleError);
    expect(() => validateProduct({ ...ok, unit: "" })).toThrow(ProductRuleError);
    expect(() => validateProduct({ ...ok, price: -1 })).toThrow("Harga jual");
    expect(() => validateProduct({ ...ok, cost: -1 })).toThrow("Harga pokok");
    expect(() => validateProduct({ ...ok, price: Number.NaN })).toThrow(ProductRuleError);
  });
});

describe("spesifikasi produk", () => {
  it("menyusun ukuran, bahan, lalu butir lain", () => {
    const p = { size: "120 x 60 cm", material: "Kayu mahoni", spec: "Finishing duco putih\n\n  Laci 2 buah " };
    expect(productSpecLines(p)).toEqual(["Ukuran 120 x 60 cm", "Bahan Kayu mahoni", "Finishing duco putih", "Laci 2 buah"]);
    expect(productSpecText(p)).toBe("Ukuran 120 x 60 cm, Bahan Kayu mahoni, Finishing duco putih, Laci 2 buah");
  });
  it("kosong bila tidak ada data", () => {
    expect(productSpecLines({})).toEqual([]);
    expect(productSpecText({ size: " ", material: null, spec: null })).toBe("");
  });
});

describe("margin", () => {
  it("persen dari harga jual, null bila harga jual 0", () => {
    expect(marginPercent(1_500_000, 900_000)).toBe(40);
    expect(marginPercent(0, 100)).toBeNull();
  });
});

describe("hak akses Master Produk", () => {
  it("Gudang dan Ketua Produksi tidak melihat modul produk (harga)", () => {
    for (const r of ["GUDANG", "KETUA_KAYU", "KETUA_BESI"] as const) {
      expect(can(r, "produk", "view")).toBe(false);
      expect(allowedModules(r)).not.toContain("produk");
    }
  });
  it("Direktur dan Admin mengelola produk; Marketing dan Keuangan hanya membaca", () => {
    expect(ROLES.filter((r) => can(r, "produk", "edit"))).toEqual(["DIREKTUR", "ADMIN"]);
    expect(ROLES.filter((r) => can(r, "produk", "view"))).toEqual(["DIREKTUR", "ADMIN", "MARKETING", "KEUANGAN"]);
  });
  it("harga pokok hanya untuk Direktur, Admin, dan Keuangan", () => {
    expect(ROLES.filter(canSeeProductCost)).toEqual(["DIREKTUR", "ADMIN", "KEUANGAN"]);
  });
});
