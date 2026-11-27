import { db } from "@/lib/db";
import { productSpecText } from "@/lib/product";

export type CatalogProduct = {
  /** Id barang jadi di Inventory: inilah yang disimpan di baris penawaran dan proyek. */
  id: string;
  code: string; name: string; unit: string;
  type: "PRODUKSI" | "DAGANG";
  /** Harga jual acuan tanpa PPN. */
  price: number;
  spec: string;
};

/**
 * Produk aktif di katalog untuk pilihan di penawaran, konfirmasi order, dan proyek. Memuat harga jual,
 * jadi hanya dipakai di halaman yang sudah dijaga hak akses penawaran/order/proyek (bukan Gudang atau Ketua Produksi).
 */
export async function catalogProducts(opts: { type?: "PRODUKSI" | "DAGANG" } = {}): Promise<CatalogProduct[]> {
  const rows = await db.product.findMany({
    where: { active: true, ...(opts.type ? { type: opts.type } : {}), item: { isNot: null } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { item: { select: { id: true } } },
  });
  return rows.map((p) => ({
    id: p.item!.id, code: p.code, name: p.name, unit: p.unit, type: p.type,
    price: Number(p.price), spec: productSpecText(p),
  }));
}
