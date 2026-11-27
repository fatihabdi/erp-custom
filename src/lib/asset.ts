// Aturan aset murni (tanpa database), supaya mudah diuji.
export type AssetTypeName = "MESIN" | "KENDARAAN" | "PERALATAN";
export type AssetStatusName = "AKTIF" | "PERAWATAN" | "RUSAK" | "DIJUAL" | "DIHAPUSKAN";
export type MaintenanceTypeName = "RUTIN" | "SERVIS" | "PERBAIKAN";

export const ASSET_TYPES: AssetTypeName[] = ["MESIN", "KENDARAAN", "PERALATAN"];
export const TYPE_LABEL: Record<AssetTypeName, string> = { MESIN: "Mesin", KENDARAAN: "Kendaraan", PERALATAN: "Peralatan" };
export const TYPE_PREFIX: Record<AssetTypeName, string> = { MESIN: "MSN", KENDARAAN: "KDR", PERALATAN: "PRL" };

export const STATUS_LABEL: Record<AssetStatusName, string> = {
  AKTIF: "Aktif", PERAWATAN: "Dalam perawatan", RUSAK: "Rusak", DIJUAL: "Dijual", DIHAPUSKAN: "Dihapuskan",
};
export const MAINTENANCE_LABEL: Record<MaintenanceTypeName, string> = {
  RUTIN: "Perawatan rutin", SERVIS: "Servis", PERBAIKAN: "Perbaikan",
};

/** Status akhir: aset tidak lagi dipakai dan datanya dikunci. */
export const TERMINAL: AssetStatusName[] = ["DIJUAL", "DIHAPUSKAN"];
/** Status yang boleh dipilih langsung; penjualan dan penghapusan lewat pelepasan aset. */
export const MANUAL_STATUSES = ["AKTIF", "PERAWATAN", "RUSAK"] as const;

export class AssetRuleError extends Error {}

export const isTerminal = (s: AssetStatusName) => TERMINAL.includes(s);

/** Hari kalender WIB dari sebuah waktu, sebagai tanggal UTC tengah malam (setara kolom @db.Date). */
export function wibDay(d: Date = new Date()): Date {
  const w = new Date(d.getTime() + 7 * 3600_000);
  return new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()));
}

/** "2026-11-27" menjadi tanggal UTC tengah malam; null bila tidak valid. */
export function parseDay(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
}

/** Jumlah bulan penuh dari `from` sampai `to` (keduanya tanggal UTC tengah malam). */
export function fullMonths(from: Date, to: Date): number {
  if (to <= from) return 0;
  let m = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) m -= 1;
  return Math.max(0, m);
}

export type Depreciation = {
  /** Bulan penuh sejak perolehan (dibatasi umur manfaat). */
  months: number;
  /** Penyusutan per bulan (rupiah). */
  monthly: number;
  accumulated: number;
  bookValue: number;
  depreciable: boolean;
  fullyDepreciated: boolean;
};

/**
 * Penyusutan garis lurus per bulan penuh: (nilai perolehan − nilai sisa) / umur manfaat.
 * Umur manfaat 0 berarti tidak disusutkan. Perhitungan dalam sen supaya tidak ada selisih
 * pembulatan, dan pada akhir umur manfaat nilai buku tepat sama dengan nilai sisa.
 * Aset yang sudah dilepas disusutkan sampai tanggal pelepasan.
 */
export function depreciation(a: {
  cost: number; salvage: number; lifeMonths: number; acquiredAt: Date; disposedAt?: Date | null; asOf?: Date;
}): Depreciation {
  const asOf = a.asOf ?? wibDay();
  const end = a.disposedAt && a.disposedAt < asOf ? a.disposedAt : asOf;
  const cost = Math.round(a.cost * 100);
  const salvage = Math.min(cost, Math.round(a.salvage * 100));
  if (a.lifeMonths <= 0) {
    return { months: 0, monthly: 0, accumulated: 0, bookValue: cost / 100, depreciable: false, fullyDepreciated: false };
  }
  const months = Math.min(a.lifeMonths, fullMonths(a.acquiredAt, end));
  const base = cost - salvage;
  const acc = months >= a.lifeMonths ? base : Math.floor((base * months) / a.lifeMonths);
  return {
    months,
    monthly: Math.round(base / a.lifeMonths) / 100,
    accumulated: acc / 100,
    bookValue: (cost - acc) / 100,
    depreciable: true,
    fullyDepreciated: months >= a.lifeMonths,
  };
}

export type DueState = "TERLAMBAT" | "SEGERA" | null;
/** Jadwal perawatan: terlambat bila lewat, segera bila ≤ 30 hari lagi. */
export function dueState(nextDueAt: Date | null | undefined, today: Date = wibDay()): DueState {
  if (!nextDueAt) return null;
  const days = Math.round((nextDueAt.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return "TERLAMBAT";
  return days <= 30 ? "SEGERA" : null;
}

/** Perubahan status manual; status akhir tidak bisa diubah lagi. */
export function checkStatusChange(from: AssetStatusName, to: AssetStatusName): void {
  if (isTerminal(from)) throw new AssetRuleError("Aset yang sudah dijual atau dihapuskan tidak bisa diubah statusnya.");
  if (!(MANUAL_STATUSES as readonly string[]).includes(to)) {
    throw new AssetRuleError("Penjualan atau penghapusan aset dilakukan lewat “Lepas aset”.");
  }
}

export function validateAssetValues(v: { cost: number; salvage: number; lifeMonths: number }): void {
  if (!Number.isFinite(v.cost) || v.cost < 0) throw new AssetRuleError("Nilai perolehan tidak boleh negatif.");
  if (!Number.isFinite(v.salvage) || v.salvage < 0) throw new AssetRuleError("Nilai sisa tidak boleh negatif.");
  if (v.salvage > v.cost) throw new AssetRuleError("Nilai sisa tidak boleh melebihi nilai perolehan.");
  if (!Number.isInteger(v.lifeMonths) || v.lifeMonths < 0 || v.lifeMonths > 1200) {
    throw new AssetRuleError("Umur manfaat harus bilangan bulat 0–1200 bulan.");
  }
}

/** Aset hanya bisa ditugaskan saat aktif. */
export function checkAssignable(status: AssetStatusName): void {
  if (status !== "AKTIF") throw new AssetRuleError("Hanya aset berstatus Aktif yang bisa ditugaskan.");
}

/** Tanggal tidak boleh sebelum perolehan atau di masa depan. */
export function checkEventDate(day: Date, acquiredAt: Date, label: string, today: Date = wibDay()): void {
  if (day < acquiredAt) throw new AssetRuleError(`${label} tidak boleh sebelum tanggal perolehan.`);
  if (day > today) throw new AssetRuleError(`${label} tidak boleh di masa depan.`);
}
