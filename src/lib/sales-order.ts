import type { Prisma } from "@/generated/prisma/client";
import { DocumentRuleError } from "@/lib/billing";
import { NotFoundError } from "@/lib/inventory";
import { detectImageType } from "@/lib/logo";

type Tx = Prisma.TransactionClient;

// Sales Order (SO): acuan produksi yang terbit bersama Konfirmasi Order (KO). Tanpa harga.

export const SO_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** Nomor SO mengikuti nomor KO: GTF-024/KO/X/2026 menjadi GTF-024/SO/X/2026. */
export function soNumber(koNumber: string): string {
  return koNumber.includes("/KO/") ? koNumber.replace("/KO/", "/SO/") : `${koNumber}/SO`;
}

export function checkSoImage(b: Uint8Array): { ok: true; mime: "image/png" | "image/jpeg" } | { ok: false; error: string } {
  if (b.length === 0) return { ok: false, error: "Berkas gambar kosong." };
  if (b.length > SO_IMAGE_MAX_BYTES) return { ok: false, error: "Gambar terlalu besar (maksimal 2 MB)." };
  const mime = detectImageType(b);
  if (!mime) return { ok: false, error: "Gambar harus berupa PNG atau JPEG." };
  return { ok: true, mime };
}

/** Spesifikasi ditulis satu butir per baris; baris kosong dibuang. */
export const specLines = (spec: string | null | undefined): string[] =>
  (spec ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

/**
 * Terbitkan SO untuk sebuah KO. `hints` (urut sesuai baris proyek) membawa nama dan spesifikasi dari penawaran;
 * tanpa itu, nama barang di katalog dipakai. Dipanggil otomatis saat KO terbit.
 */
export async function createProductionOrder(tx: Tx, orderId: string, hints?: { title: string; spec?: string | null }[]) {
  const ko = await tx.salesOrder.findUnique({ where: { id: orderId }, include: { production: true } });
  if (!ko) throw new NotFoundError("Konfirmasi Order tidak ditemukan.");
  if (ko.production) return ko.production;
  const lines = await tx.projectLine.findMany({
    where: { projectId: ko.projectId }, orderBy: { sort: "asc" }, include: { product: { select: { name: true } } },
  });
  return tx.productionOrder.create({
    data: {
      companyId: ko.companyId, projectId: ko.projectId, orderId: ko.id, number: soNumber(ko.number),
      lines: {
        create: lines.map((l, i) => ({
          projectLineId: l.id, sort: l.sort,
          title: hints?.[i]?.title.trim() || l.product.name, spec: hints?.[i]?.spec?.trim() || null,
        })),
      },
    },
  });
}

export type SoUpdate = { notes?: string | null; lines: { id: string; title: string; spec?: string | null }[] };

export async function updateProductionOrder(tx: Tx, id: string, input: SoUpdate) {
  const so = await tx.productionOrder.findUnique({ where: { id }, include: { lines: { select: { id: true } } } });
  if (!so) throw new NotFoundError("Sales Order tidak ditemukan.");
  const ids = new Set(so.lines.map((l) => l.id));
  for (const l of input.lines) {
    if (!ids.has(l.id)) throw new DocumentRuleError("Barang tidak ada di Sales Order ini.");
    if (!l.title.trim()) throw new DocumentRuleError("Nama barang wajib diisi.");
    if ((l.spec ?? "").length > 2000) throw new DocumentRuleError("Spesifikasi terlalu panjang (maksimal 2000 karakter).");
  }
  if ((input.notes ?? "").length > 2000) throw new DocumentRuleError("Catatan terlalu panjang (maksimal 2000 karakter).");
  for (const l of input.lines) {
    await tx.productionOrderLine.update({ where: { id: l.id }, data: { title: l.title.trim(), spec: l.spec?.trim() || null } });
  }
  return tx.productionOrder.update({ where: { id }, data: { notes: input.notes?.trim() || null } });
}
