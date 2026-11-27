import { describe, expect, it } from "vitest";
import { ROLES } from "../permissions";
import { normalizeQuery, searchableKinds } from "../search";

describe("pencarian global (aturan)", () => {
  it("hasil dibatasi menurut hak modul peran", () => {
    expect(searchableKinds("DIREKTUR")).toEqual(["pelanggan", "proyek", "penawaran", "order", "invoice", "sales-order", "produk"]);
    expect(searchableKinds("MARKETING")).toEqual(["pelanggan", "proyek", "penawaran", "order", "invoice", "sales-order", "produk"]);
    expect(searchableKinds("KEUANGAN")).toEqual(["pelanggan", "proyek", "penawaran", "order", "invoice", "produk"]);
    expect(searchableKinds("GUDANG")).toEqual(["proyek", "sales-order"]);
    expect(searchableKinds("KETUA_KAYU")).toEqual(["sales-order"]);
    expect(searchableKinds("KETUA_BESI")).toEqual(["sales-order"]);
  });
  it("setiap peran bisa mencari sesuatu", () => {
    for (const r of ROLES) expect(searchableKinds(r).length).toBeGreaterThan(0);
  });
  it("kata kunci dirapikan dan dibatasi 60 karakter", () => {
    expect(normalizeQuery("  meja   siswa \n")).toBe("meja siswa");
    expect(normalizeQuery(null)).toBe("");
    expect(normalizeQuery("x".repeat(100))).toHaveLength(60);
  });
});
