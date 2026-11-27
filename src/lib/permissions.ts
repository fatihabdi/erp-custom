// Hak akses per peran. Satu sumber kebenaran untuk menu, halaman, dan aksi server.
export const ROLES = ["DIREKTUR", "ADMIN", "MARKETING", "GUDANG", "KEUANGAN", "KETUA_KAYU", "KETUA_BESI"] as const;
export type RoleName = (typeof ROLES)[number];

export const ROLE_LABEL: Record<RoleName, string> = {
  DIREKTUR: "Direktur",
  ADMIN: "Admin",
  MARKETING: "Marketing",
  GUDANG: "Gudang",
  KEUANGAN: "Keuangan",
  KETUA_KAYU: "Ketua Produksi Kayu",
  KETUA_BESI: "Ketua Produksi Besi",
};

export const MODULES = [
  "dashboard",
  "penawaran",
  "order",
  "sales-order",
  "proyek",
  "inventory",
  "produk",
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
    dashboard: ALL, penawaran: ALL, order: ALL, "sales-order": ALL, proyek: ALL, inventory: ALL, produk: ALL,
    invoice: ALL, kwitansi: ALL, aset: ALL, laporan: ALL, pengguna: ALL, pengaturan: ALL,
  },
  ADMIN: {
    dashboard: READ, penawaran: WRITE, order: WRITE, "sales-order": WRITE, proyek: WRITE, inventory: WRITE, produk: WRITE,
    invoice: WRITE, kwitansi: WRITE, aset: WRITE, laporan: READ, pengguna: ALL, pengaturan: WRITE,
  },
  MARKETING: {
    dashboard: READ, penawaran: WRITE, order: WRITE, "sales-order": WRITE, proyek: READ, inventory: READ, produk: READ,
    invoice: READ,
  },
  GUDANG: {
    dashboard: READ, "sales-order": READ, proyek: READ, inventory: WRITE, aset: WRITE,
  },
  KEUANGAN: {
    dashboard: READ, penawaran: READ, order: READ, proyek: READ, inventory: READ, produk: READ,
    invoice: WRITE, kwitansi: WRITE, laporan: READ,
  },
  // Master Produk memuat harga jual dan harga pokok, jadi Gudang dan Ketua Produksi tidak punya akses ke modul ini.
  // Ketua produksi hanya melihat Sales Order (acuan kerja) dan memperbarui tahapnya sendiri.
  // Tanpa akses dashboard, proyek, invoice, atau stok, jadi harga dan biaya tidak terlihat.
  KETUA_KAYU: { "sales-order": READ },
  KETUA_BESI: { "sales-order": READ },
};

// Tahap produksi yang boleh diperbarui peran tertentu di halaman Sales Order, selain pemegang hak edit proyek.
export const STAGE_OWNERS: Partial<Record<RoleName, readonly string[]>> = {
  KETUA_KAYU: ["POTONG_KAYU"],
  KETUA_BESI: ["RANGKA_BESI"],
};

/** Boleh memperbarui progres tahap ini? Pemegang hak edit proyek boleh semua; ketua produksi hanya tahapnya. */
export function canUpdateStage(role: RoleName, stage: string): boolean {
  return can(role, "proyek", "edit") || (can(role, "sales-order", "view") && (STAGE_OWNERS[role]?.includes(stage) ?? false));
}

export function can(role: RoleName, module: ModuleName, action: Action = "view"): boolean {
  return PERMISSIONS[role]?.[module]?.includes(action) ?? false;
}

/** Harga pokok produk lebih sensitif dari harga jual: hanya Direktur, Admin, dan Keuangan. Marketing hanya melihat harga jual. */
export function canSeeProductCost(role: RoleName): boolean {
  return role === "DIREKTUR" || role === "ADMIN" || role === "KEUANGAN";
}

export function allowedModules(role: RoleName): ModuleName[] {
  return MODULES.filter((m) => can(role, m, "view"));
}

/** Halaman awal setelah masuk: Dashboard bila boleh, selain itu modul pertama yang boleh dilihat. */
export function homePath(role: RoleName): string {
  const m = allowedModules(role)[0];
  return can(role, "dashboard") || !m ? "/dashboard" : `/${m}`;
}
