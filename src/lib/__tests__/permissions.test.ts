import { describe, expect, it } from "vitest";
import { allowedModules, can, MODULES, ROLES } from "../permissions";

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
  it("semua peran melihat dashboard", () => {
    for (const r of ROLES) expect(allowedModules(r)).toContain("dashboard");
  });
});
