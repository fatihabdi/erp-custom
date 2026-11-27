import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export const PRODUCT_CATEGORIES = ["SEKOLAH", "KANTOR", "RUMAHAN", "LAINNYA"] as const;
export type ProductCategoryName = (typeof PRODUCT_CATEGORIES)[number];
export const PRODUCT_TYPES = ["PRODUKSI", "DAGANG"] as const;
export type ProductTypeName = (typeof PRODUCT_TYPES)[number];

export const CATEGORY_LABEL: Record<ProductCategoryName, string> = {
  SEKOLAH: "Sekolah", KANTOR: "Kantor", RUMAHAN: "Rumahan", LAINNYA: "Lainnya",
};
export const TYPE_LABEL: Record<ProductTypeName, string> = { PRODUKSI: "Produksi", DAGANG: "Dagang" };

/** Nilai khusus pada pemetaan barang saat KO: buat produk baru dari baris penawaran yang custom. */
export const NEW_PRODUCT = "__baru__";

export class ProductRuleError extends Error {}

export type ProductInput = {
  name: string;
  category: ProductCategoryName;
  type: ProductTypeName;
  unit: string;
  size?: string | null;
  material?: string | null;
  spec?: string | null;
  /** Harga jual acuan, tanpa PPN (rupiah). */
  price: number;
  /** Harga pokok, diisi manual (rupiah). */
  cost: number;
  active?: boolean;
};

export const roundRp = (n: number) => Math.round(n * 100) / 100;

export function validateProduct(i: ProductInput) {
  if (!i.name.trim()) throw new ProductRuleError("Nama produk wajib diisi.");
  if (!i.unit.trim()) throw new ProductRuleError("Satuan wajib diisi.");
  if (!(PRODUCT_CATEGORIES as readonly string[]).includes(i.category)) throw new ProductRuleError("Kategori tidak valid.");
  if (!(PRODUCT_TYPES as readonly string[]).includes(i.type)) throw new ProductRuleError("Tipe produk tidak valid.");
  if (!Number.isFinite(i.price) || i.price < 0) throw new ProductRuleError("Harga jual tidak boleh negatif.");
  if (!Number.isFinite(i.cost) || i.cost < 0) throw new ProductRuleError("Harga pokok tidak boleh negatif.");
}

type SpecSource = { size?: string | null; material?: string | null; spec?: string | null };

/** Butir spesifikasi produk: ukuran, bahan, lalu butir lain (satu per baris). */
export function productSpecLines(p: SpecSource): string[] {
  const extra = (p.spec ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return [p.size?.trim() && `Ukuran ${p.size.trim()}`, p.material?.trim() && `Bahan ${p.material.trim()}`, ...extra]
    .filter((x): x is string => !!x);
}

/** Teks spesifikasi satu baris untuk baris penawaran. */
export const productSpecText = (p: SpecSource): string => productSpecLines(p).join(", ");

/** Margin kotor dalam persen dari harga jual; null bila harga jual 0. */
export function marginPercent(price: number, cost: number): number | null {
  if (!(price > 0)) return null;
  return Math.round(((price - cost) / price) * 1000) / 10;
}

async function nextProductCode(tx: Tx): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('product-code', 0))`;
  const [p, i] = await Promise.all([
    tx.product.findMany({ where: { code: { startsWith: "PRD-" } }, select: { code: true } }),
    tx.item.findMany({ where: { code: { startsWith: "PRD-" } }, select: { code: true } }),
  ]);
  const max = [...p, ...i].reduce((m, r) => Math.max(m, parseInt(r.code.slice(4), 10) || 0), 0);
  return `PRD-${String(max + 1).padStart(3, "0")}`;
}

const clean = (s: string | null | undefined) => s?.trim() || null;

/**
 * Buat produk beserta barang jadi di Inventory (stok 0). Id barang jadi inilah yang dipakai baris penawaran,
 * proyek, dan mutasi stok.
 */
export async function createProduct(tx: Tx, input: ProductInput) {
  validateProduct(input);
  const code = await nextProductCode(tx);
  const unit = input.unit.trim();
  const name = input.name.trim();
  const product = await tx.product.create({
    data: {
      code, name, unit, category: input.category, type: input.type,
      size: clean(input.size), material: clean(input.material), spec: clean(input.spec),
      price: roundRp(input.price), cost: roundRp(input.cost), active: input.active ?? true,
      item: { create: { kind: "FINISHED", code, name, unit, active: input.active ?? true } },
    },
    include: { item: { select: { id: true } } },
  });
  return { product, itemId: product.item!.id };
}

/** Ubah produk; nama, satuan, dan status aktif disalin ke barang jadi supaya stok dan dokumen konsisten. */
export async function updateProduct(tx: Tx, id: string, input: ProductInput) {
  validateProduct(input);
  const cur = await tx.product.findUnique({ where: { id }, include: { item: { select: { id: true } } } });
  if (!cur || !cur.item) throw new ProductRuleError("Produk tidak ditemukan.");
  if (input.type === "DAGANG" && cur.type !== "DAGANG") {
    const bom = await tx.bomLine.count({ where: { productId: cur.item.id } });
    if (bom > 0) throw new ProductRuleError("Produk yang sudah punya BOM tidak bisa diubah menjadi produk dagang. Kosongkan BOM lebih dulu.");
  }
  const name = input.name.trim();
  const unit = input.unit.trim();
  const active = input.active ?? cur.active;
  const product = await tx.product.update({
    where: { id },
    data: {
      name, unit, category: input.category, type: input.type,
      size: clean(input.size), material: clean(input.material), spec: clean(input.spec),
      price: roundRp(input.price), cost: roundRp(input.cost), active,
    },
  });
  await tx.item.update({ where: { id: cur.item.id }, data: { name, unit, active } });
  return product;
}
