// Hak akses per peran. Satu sumber kebenaran untuk menu, halaman, dan aksi server.
export const ROLES = ["DIREKTUR", "ADMIN", "MARKETING", "GUDANG", "KEUANGAN"] as const;
export type RoleName = (typeof ROLES)[number];

export const ROLE_LABEL: Record<RoleName, string> = {
  DIREKTUR: "Direktur",
  ADMIN: "Admin",
  MARKETING: "Marketing",
  GUDANG: "Gudang",
  KEUANGAN: "Keuangan",
};

export const MODULES = [
  "dashboard",
  "penawaran",
  "order",
  "proyek",
  "inventory",
  "invoice",
  "kwitansi",
  "aset",
  "laporan",
  "pengguna",
  "pengaturan",
] as const;
export type ModuleName = (typeof MODULES)[number];

export type Action = "view" | "create" | "edit" | "delete" | "approve";

const ALL: Action[] = ["view", "create", "edit", "delete", "approve"];
const WRITE: Action[] = ["view", "create", "edit"];
const READ: Action[] = ["view"];

type Matrix = Record<RoleName, Partial<Record<ModuleName, Action[]>>>;

export const PERMISSIONS: Matrix = {
  DIREKTUR: {
    dashboard: ALL, penawaran: ALL, order: ALL, proyek: ALL, inventory: ALL,
    invoice: ALL, kwitansi: ALL, aset: ALL, laporan: ALL, pengguna: ALL, pengaturan: ALL,
  },
  ADMIN: {
    dashboard: READ, penawaran: WRITE, order: WRITE, proyek: WRITE, inventory: WRITE,
    invoice: WRITE, kwitansi: WRITE, aset: WRITE, laporan: READ, pengguna: ALL, pengaturan: WRITE,
  },
  MARKETING: {
    dashboard: READ, penawaran: WRITE, order: WRITE, proyek: READ, inventory: READ,
    invoice: READ,
  },
  GUDANG: {
    dashboard: READ, proyek: READ, inventory: WRITE, aset: WRITE,
  },
  KEUANGAN: {
    dashboard: READ, penawaran: READ, order: READ, proyek: READ, inventory: READ,
    invoice: WRITE, kwitansi: WRITE, laporan: READ,
  },
};

export function can(role: RoleName, module: ModuleName, action: Action = "view"): boolean {
  return PERMISSIONS[role]?.[module]?.includes(action) ?? false;
}

export function allowedModules(role: RoleName): ModuleName[] {
  return MODULES.filter((m) => can(role, m, "view"));
}
