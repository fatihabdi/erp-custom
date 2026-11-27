// Aturan stok murni (tanpa database), supaya mudah diuji.
export type ItemKindName = "RAW" | "FINISHED";
export type MovementTypeName =
  | "MASUK" | "KELUAR" | "PENYESUAIAN" | "PRODUKSI_MASUK" | "PEMAKAIAN_BAHAN" | "KIRIM";

export const MOVEMENT_LABEL: Record<MovementTypeName, string> = {
  MASUK: "Stok masuk",
  KELUAR: "Stok keluar",
  PENYESUAIAN: "Penyesuaian",
  PRODUKSI_MASUK: "Hasil produksi (QC lulus)",
  PEMAKAIAN_BAHAN: "Pemakaian bahan produksi",
  KIRIM: "Pengiriman",
};

/** Jenis mutasi manual yang boleh dibuat dari layar Stok. */
export const MANUAL_TYPES = ["MASUK", "KELUAR", "PENYESUAIAN"] as const;

/** Jenis barang yang boleh dikenai tiap jenis mutasi. */
const ALLOWED_KINDS: Record<MovementTypeName, ItemKindName[]> = {
  MASUK: ["RAW", "FINISHED"],
  KELUAR: ["RAW", "FINISHED"],
  PENYESUAIAN: ["RAW", "FINISHED"],
  PRODUKSI_MASUK: ["FINISHED"],
  PEMAKAIAN_BAHAN: ["RAW"],
  KIRIM: ["FINISHED"],
};

export function kindAllowed(type: MovementTypeName, kind: ItemKindName): boolean {
  return ALLOWED_KINDS[type].includes(kind);
}

/** Pembulatan 3 desimal, sama dengan kolom Decimal(14,3). */
export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

export class StockRuleError extends Error {}

/**
 * Mengubah jumlah masukan menjadi perubahan saldo bertanda.
 * Masuk = +, keluar = -. Penyesuaian memakai tanda dari masukan (tidak boleh nol).
 * Untuk jenis lain, jumlah harus positif.
 */
export function signedDelta(type: MovementTypeName, qty: number): number {
  if (!Number.isFinite(qty) || qty === 0) throw new StockRuleError("Jumlah tidak boleh nol.");
  const q = round3(qty);
  if (q === 0) throw new StockRuleError("Jumlah terlalu kecil (minimal 0,001).");
  if (type === "PENYESUAIAN") return q;
  if (q < 0) throw new StockRuleError("Jumlah harus positif.");
  return type === "MASUK" || type === "PRODUKSI_MASUK" ? q : -q;
}

export type StockStatus = "AMAN" | "MENIPIS" | "HABIS";

export function stockStatus(onHand: number, minStock: number): StockStatus {
  if (onHand <= 0) return "HABIS";
  if (onHand < minStock) return "MENIPIS";
  return "AMAN";
}

export const STATUS_LABEL: Record<StockStatus, string> = { AMAN: "Aman", MENIPIS: "Menipis", HABIS: "Habis" };

export type BomLineInput = { materialId: string; qty: number };

/** Kebutuhan bahan baku untuk memproduksi `units` unit barang jadi. */
export function bomRequirement(lines: BomLineInput[], units: number): BomLineInput[] {
  if (!(units > 0)) throw new StockRuleError("Jumlah produksi harus lebih dari nol.");
  const need = new Map<string, number>();
  for (const l of lines) need.set(l.materialId, (need.get(l.materialId) ?? 0) + l.qty * units);
  // Dibulatkan ke atas pada 3 desimal supaya stok tidak pernah kekurangan karena pembulatan.
  return [...need].map(([materialId, qty]) => ({ materialId, qty: Math.ceil(qty * 1000 - 1e-9) / 1000 }));
}

export type Shortage = { materialId: string; needed: number; available: number; missing: number };

export function findShortages(required: BomLineInput[], onHand: Map<string, number>): Shortage[] {
  const out: Shortage[] = [];
  for (const r of required) {
    const available = onHand.get(r.materialId) ?? 0;
    if (available < r.qty) {
      out.push({ materialId: r.materialId, needed: r.qty, available, missing: round3(r.qty - available) });
    }
  }
  return out;
}

/** Validasi baris BOM dari formulir: bahan unik dan jumlah positif. */
export function validateBomLines(lines: BomLineInput[]): void {
  const seen = new Set<string>();
  for (const l of lines) {
    if (!(l.qty > 0) || !Number.isFinite(l.qty)) throw new StockRuleError("Jumlah bahan pada BOM harus lebih dari nol.");
    if (seen.has(l.materialId)) throw new StockRuleError("Bahan yang sama muncul dua kali pada BOM.");
    seen.add(l.materialId);
  }
}

/**
 * Harga pokok rata-rata bergerak setelah stok masuk dibeli dengan harga tertentu.
 * Bila stok lama kosong, harga pokok mengikuti harga beli terbaru.
 */
export function weightedAverageCost(onHand: number, currentCost: number, qty: number, price: number): number {
  if (!(qty > 0) || !Number.isFinite(price) || price < 0) throw new StockRuleError("Harga beli tidak valid.");
  const base = Math.max(onHand, 0);
  const total = base + qty;
  return Math.round(((base * currentCost + qty * price) / total) * 100) / 100;
}

/** Tanggal mutasi tidak boleh di masa depan (toleransi 1 hari untuk selisih zona waktu) dan tidak absurd. */
export function validateMovementDate(d: Date, now = new Date()): void {
  if (Number.isNaN(d.getTime())) throw new StockRuleError("Tanggal mutasi tidak valid.");
  if (d.getTime() > now.getTime() + 86_400_000) throw new StockRuleError("Tanggal mutasi tidak boleh di masa depan.");
  if (d.getUTCFullYear() < 2000) throw new StockRuleError("Tanggal mutasi tidak valid.");
}

/** Selisih stok opname: hasil hitung fisik dikurangi saldo tercatat. */
export function countDifference(onHand: number, counted: number): number {
  if (!Number.isFinite(counted) || counted < 0) throw new StockRuleError("Hasil hitung tidak boleh negatif.");
  const diff = round3(counted - onHand);
  if (diff === 0) throw new StockRuleError("Hasil hitung sama dengan stok tercatat, tidak ada selisih.");
  return diff;
}

/**
 * Mengubah isian tanggal (YYYY-MM-DD, WIB) menjadi waktu kejadian. Hari ini atau kosong = sekarang;
 * tanggal lain dicatat pukul 12.00 WIB supaya urutan harian tidak bergeser oleh zona waktu.
 */
export function parseMovementDate(input: string | null | undefined, now = new Date()): Date | undefined {
  const v = input?.trim();
  if (!v) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new StockRuleError("Tanggal mutasi tidak valid.");
  const today = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  if (v === today) return undefined;
  const d = new Date(`${v}T12:00:00+07:00`);
  if (Number.isNaN(d.getTime())) throw new StockRuleError("Tanggal mutasi tidak valid.");
  return d;
}

/** Angka isian rupiah: "15.000" (pemisah ribuan) dan "12,5" (koma desimal) keduanya dipahami. */
export function parseMoneyInput(v: string): number {
  const t = v.trim();
  const clean = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, "") : t;
  return Number(clean.replace(",", "."));
}
