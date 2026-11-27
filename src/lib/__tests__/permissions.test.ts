import { describe, expect, it } from "vitest";
import { allowedModules, can, canUpdateStage, homePath, MODULES, ROLE_LABEL, ROLES } from "../permissions";

describe("permissions", () => {
  it("Direktur boleh semua aksi di semua modul", () => {
    for (const m of MODULES) expect(can("DIREKTUR", m, "approve")).toBe(true);
  });
  it("Gudang tidak bisa melihat invoice atau pengguna", () => {
    expect(can("GUDANG", "invoice")).toBe(false);
    expect(can("GUDANG", "pengguna")).toBe(false);
    expect(can("GUDANG", "inventory", "edit")).toBe(true);
  });
  it("Keuangan bisa menulis invoice dan kwitansi, hanya membaca penawaran", () => {
    expect(can("KEUANGAN", "invoice", "create")).toBe(true);
    expect(can("KEUANGAN", "kwitansi", "create")).toBe(true);
    expect(can("KEUANGAN", "penawaran", "create")).toBe(false);
    expect(can("KEUANGAN", "penawaran", "view")).toBe(true);
  });
  it("Marketing membuat penawaran tetapi tidak mengubah invoice", () => {
    expect(can("MARKETING", "penawaran", "create")).toBe(true);
    expect(can("MARKETING", "invoice", "edit")).toBe(false);
  });
  it("hanya Direktur dan Admin mengelola pengguna", () => {
    expect(ROLES.filter((r) => can(r, "pengguna", "create"))).toEqual(["DIREKTUR", "ADMIN"]);
  });
  it("semua peran selain ketua produksi melihat dashboard", () => {
    for (const r of ROLES.filter((r) => r !== "KETUA_KAYU" && r !== "KETUA_BESI")) expect(allowedModules(r)).toContain("dashboard");
  });
  it("ketua produksi hanya melihat Sales Order, tanpa harga, biaya, invoice, atau stok", () => {
    for (const r of ["KETUA_KAYU", "KETUA_BESI"] as const) {
      expect(allowedModules(r)).toEqual(["sales-order"]);
      expect(can(r, "sales-order", "edit")).toBe(false);
      for (const m of ["dashboard", "proyek", "order", "penawaran", "invoice", "kwitansi", "inventory", "laporan"] as const) expect(can(r, m)).toBe(false);
      expect(homePath(r)).toBe("/sales-order");
    }
    expect(ROLE_LABEL.KETUA_KAYU).toBe("Ketua Produksi Kayu");
    expect(ROLE_LABEL.KETUA_BESI).toBe("Ketua Produksi Besi");
  });
  it("Gudang membaca Sales Order untuk packing tetapi tidak mengubahnya", () => {
    expect(can("GUDANG", "sales-order", "view")).toBe(true);
    expect(can("GUDANG", "sales-order", "edit")).toBe(false);
    expect(can("KEUANGAN", "sales-order", "view")).toBe(false);
  });
  it("Admin, Marketing, dan Direktur boleh mengubah Sales Order", () => {
    expect(ROLES.filter((r) => can(r, "sales-order", "edit"))).toEqual(["DIREKTUR", "ADMIN", "MARKETING"]);
  });
  it("ketua produksi hanya memperbarui tahapnya sendiri", () => {
    expect(canUpdateStage("KETUA_KAYU", "POTONG_KAYU")).toBe(true);
    expect(canUpdateStage("KETUA_KAYU", "RANGKA_BESI")).toBe(false);
    expect(canUpdateStage("KETUA_BESI", "RANGKA_BESI")).toBe(true);
    expect(canUpdateStage("KETUA_BESI", "FINISHING")).toBe(false);
    expect(canUpdateStage("ADMIN", "FINISHING")).toBe(true);
    expect(canUpdateStage("GUDANG", "POTONG_KAYU")).toBe(false);
  });
  it("laporan hanya untuk Direktur dan Keuangan", () => {
    expect(ROLES.filter((r) => can(r, "laporan"))).toEqual(["DIREKTUR", "KEUANGAN"]);
  });
  it("halaman awal: dashboard bila boleh", () => {
    expect(homePath("ADMIN")).toBe("/dashboard");
    expect(homePath("GUDANG")).toBe("/dashboard");
  });
});
