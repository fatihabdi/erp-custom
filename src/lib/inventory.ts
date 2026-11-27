import type { Prisma } from "@/generated/prisma/client";
import {
  bomRequirement, countDifference, findShortages, kindAllowed, round3, signedDelta, StockRuleError, validateBomLines,
  validateMovementDate, weightedAverageCost,
  MOVEMENT_LABEL,
  type BomLineInput, type ItemKindName, type MovementTypeName, type Shortage,
} from "@/lib/stock";

type Tx = Prisma.TransactionClient;
const num = (d: Prisma.Decimal | number) => Number(d);

export class InsufficientStockError extends Error {
  constructor(public shortages: Shortage[], message = "Stok tidak cukup.") {
    super(message);
  }
}
export class NotFoundError extends Error {}

export type MovementInput = {
  itemId: string;
  type: MovementTypeName;
  /** Positif untuk semua jenis; untuk PENYESUAIAN boleh negatif. */
  qty: number;
  note?: string | null;
  refType?: string | null;
  refId?: string | null;
  idempotencyKey?: string | null;
  userId?: string | null;
  /** Tanggal kejadian; bawaan: sekarang. */
  occurredAt?: Date | null;
  /** Hanya stok masuk: harga beli per satuan (rupiah) dan pemasok. */
  unitCost?: number | null;
  supplier?: string | null;
  /** Nomor rujukan bebas (SO, nota, surat jalan). */
  reference?: string | null;
  /** Hanya stok keluar: proyek tujuan pemakaian. Disimpan sebagai rujukan PROYEK. */
  projectId?: string | null;
  /** Hanya penyesuaian (stok opname): hasil hitung fisik; selisih dihitung dari saldo terkunci. Mengganti `qty`. */
  countedQty?: number | null;
};

async function advisoryLock(tx: Tx, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

/**
 * Satu-satunya jalan mengubah saldo stok. Harus dipanggil di dalam transaksi
 * (db.$transaction) supaya beberapa mutasi (mis. pemakaian banyak bahan) bersifat
 * semua-atau-tidak-sama-sekali. Saldo tidak pernah negatif.
 */
export async function applyMovement(tx: Tx, input: MovementInput) {
  if (input.idempotencyKey) {
    await advisoryLock(tx, input.idempotencyKey);
    const existing = await tx.stockMovement.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return { movement: existing, duplicate: true as const };
  }
  const item = await tx.item.findUnique({ where: { id: input.itemId } });
  if (!item) throw new NotFoundError("Barang tidak ditemukan.");
  if (!item.active) throw new StockRuleError(`${item.code} nonaktif.`);
  if (!kindAllowed(input.type, item.kind)) {
    throw new StockRuleError(`${MOVEMENT_LABEL[input.type]} tidak berlaku untuk ${item.kind === "RAW" ? "bahan baku" : "barang jadi"}.`);
  }
  if (input.type === "PENYESUAIAN" && !input.note?.trim()) {
    throw new StockRuleError("Penyesuaian wajib diberi alasan.");
  }
  if (input.occurredAt) validateMovementDate(input.occurredAt);
  if (input.unitCost != null && input.type !== "MASUK") throw new StockRuleError("Harga beli hanya untuk stok masuk.");
  if (input.unitCost != null && !(input.unitCost >= 0)) throw new StockRuleError("Harga beli tidak boleh negatif.");
  if (input.supplier?.trim() && input.type !== "MASUK") throw new StockRuleError("Pemasok hanya untuk stok masuk.");
  if (input.projectId && input.type !== "KELUAR") throw new StockRuleError("Proyek tujuan hanya untuk stok keluar.");
  if (input.countedQty != null && input.type !== "PENYESUAIAN") throw new StockRuleError("Hasil hitung hanya untuk penyesuaian.");

  let refType = input.refType ?? null;
  let refId = input.refId ?? null;
  if (input.projectId) {
    const project = await tx.project.findUnique({ where: { id: input.projectId }, select: { id: true, status: true } });
    if (!project) throw new NotFoundError("Proyek tujuan tidak ditemukan.");
    if (project.status === "BATAL") throw new StockRuleError("Proyek tujuan sudah dibatalkan.");
    refType = "PROYEK";
    refId = project.id;
  }

  let qty = input.qty;
  if (input.countedQty != null) {
    // Kunci baris barang supaya selisih dihitung dari saldo yang benar-benar berlaku.
    await tx.$queryRaw`SELECT id FROM items WHERE id = ${item.id} FOR UPDATE`;
    const cur = await tx.item.findUniqueOrThrow({ where: { id: item.id }, select: { onHand: true } });
    qty = countDifference(num(cur.onHand), input.countedQty);
  }
  const delta = signedDelta(input.type, qty);

  if (delta < 0) {
    // Pengurangan atomik: gagal bila saldo kurang, tanpa risiko dua permintaan bersamaan.
    const res = await tx.item.updateMany({
      where: { id: item.id, onHand: { gte: -delta } },
      data: { onHand: { decrement: -delta } },
    });
    if (res.count === 0) {
      const cur = await tx.item.findUniqueOrThrow({ where: { id: item.id }, select: { onHand: true } });
      throw new InsufficientStockError(
        [{ materialId: item.id, needed: -delta, available: num(cur.onHand), missing: round3(-delta - num(cur.onHand)) }],
        `Stok ${item.code} tidak cukup: tersedia ${num(cur.onHand)}, diminta ${-delta}.`,
      );
    }
  } else {
    // Harga pokok bahan baku mengikuti rata-rata bergerak dari pembelian; dihitung dengan saldo sebelum masuk.
    let newCost: number | undefined;
    if (input.type === "MASUK" && input.unitCost && item.kind === "RAW") {
      await advisoryLock(tx, `item-cost:${item.id}`);
      const cur = await tx.item.findUniqueOrThrow({ where: { id: item.id }, select: { onHand: true, unitCost: true } });
      newCost = weightedAverageCost(num(cur.onHand), num(cur.unitCost), delta, input.unitCost);
    }
    await tx.item.update({
      where: { id: item.id },
      data: { onHand: { increment: delta }, ...(newCost !== undefined ? { unitCost: newCost } : {}) },
    });
  }
  const after = await tx.item.findUniqueOrThrow({ where: { id: item.id }, select: { onHand: true } });
  const movement = await tx.stockMovement.create({
    data: {
      itemId: item.id,
      type: input.type,
      qty: delta,
      balanceAfter: after.onHand,
      note: input.note?.trim() || null,
      refType,
      refId,
      idempotencyKey: input.idempotencyKey ?? null,
      userId: input.userId ?? null,
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
      unitCost: input.unitCost ?? null,
      supplier: input.supplier?.trim() || null,
      reference: input.reference?.trim() || null,
    },
  });
  return { movement, duplicate: false as const };
}

// ---------------------------------------------------------------------------
// Fungsi untuk modul Proyek (tahap produksi)
// ---------------------------------------------------------------------------

/**
 * Barang jadi masuk stok saat QC lulus. `qcId` = id catatan QC di modul Proyek;
 * memanggil dua kali dengan `qcId` yang sama hanya menambah stok sekali.
 */
export function receiveFinishedGoodsAtQc(
  tx: Tx,
  p: { productId: string; qty: number; qcId: string; projectId?: string; userId?: string | null; note?: string },
) {
  return applyMovement(tx, {
    itemId: p.productId,
    type: "PRODUKSI_MASUK",
    qty: p.qty,
    note: p.note,
    refType: "QC",
    refId: p.projectId ?? p.qcId,
    idempotencyKey: `qc:${p.qcId}`,
    userId: p.userId,
  });
}

/** Barang jadi keluar untuk pengiriman (mendukung pengiriman sebagian: satu `deliveryId` per pengiriman). */
export function shipFinishedGoods(
  tx: Tx,
  p: { productId: string; qty: number; deliveryId: string; userId?: string | null; note?: string },
) {
  return applyMovement(tx, {
    itemId: p.productId,
    type: "KIRIM",
    qty: p.qty,
    note: p.note,
    refType: "PENGIRIMAN",
    refId: p.deliveryId,
    idempotencyKey: `kirim:${p.deliveryId}:${p.productId}`,
    userId: p.userId,
  });
}

export async function getBom(tx: Tx, productId: string) {
  const lines = await tx.bomLine.findMany({
    where: { productId },
    include: { material: { select: { id: true, code: true, name: true, unit: true, onHand: true } } },
    orderBy: { material: { code: "asc" } },
  });
  return lines.map((l) => ({ ...l, qty: num(l.qty), material: { ...l.material, onHand: num(l.material.onHand) } }));
}

/** Kebutuhan bahan baku (menurut BOM) untuk `units` unit, beserta kekurangan stok bila ada. */
export async function checkMaterialAvailability(tx: Tx, productId: string, units: number) {
  const lines = await tx.bomLine.findMany({ where: { productId } });
  const required = bomRequirement(lines.map((l) => ({ materialId: l.materialId, qty: num(l.qty) })), units);
  const items = await tx.item.findMany({ where: { id: { in: required.map((r) => r.materialId) } } });
  const onHand = new Map(items.map((i) => [i.id, num(i.onHand)]));
  return { required, shortages: findShortages(required, onHand) };
}

/**
 * Memakai bahan baku untuk produksi `units` unit barang jadi sesuai BOM.
 * Semua-atau-tidak-sama-sekali: bila ada bahan kurang, tidak ada yang dipotong
 * dan semua kekurangan dilaporkan sekaligus.
 */
export async function issueMaterialsForProduction(
  tx: Tx,
  p: { productId: string; units: number; productionId: string; userId?: string | null },
) {
  const product = await tx.item.findUnique({ where: { id: p.productId } });
  if (!product || product.kind !== "FINISHED") throw new NotFoundError("Barang jadi tidak ditemukan.");
  const { required, shortages } = await checkMaterialAvailability(tx, p.productId, p.units);
  if (required.length === 0) throw new StockRuleError(`${product.code} belum punya BOM.`);
  if (shortages.length > 0) throw new InsufficientStockError(shortages, "Bahan baku tidak cukup untuk produksi.");
  const results = [];
  for (const r of required) {
    results.push(
      await applyMovement(tx, {
        itemId: r.materialId,
        type: "PEMAKAIAN_BAHAN",
        qty: r.qty,
        note: `Produksi ${p.units} × ${product.code}`,
        refType: "PRODUKSI",
        refId: p.productionId,
        idempotencyKey: `prod:${p.productionId}:${r.materialId}`,
        userId: p.userId,
      }),
    );
  }
  return results;
}

// ---------------------------------------------------------------------------
// Master barang dan BOM
// ---------------------------------------------------------------------------

const CODE_PREFIX: Record<ItemKindName, string> = { RAW: "BB", FINISHED: "BJ" };

export async function nextItemCode(tx: Tx, kind: ItemKindName): Promise<string> {
  const prefix = CODE_PREFIX[kind];
  await advisoryLock(tx, `item-code:${prefix}`);
  const rows = await tx.item.findMany({ where: { code: { startsWith: `${prefix}-` } }, select: { code: true } });
  const max = rows.reduce((m, r) => Math.max(m, parseInt(r.code.slice(prefix.length + 1), 10) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

/** Mengganti seluruh baris BOM sebuah barang jadi. Bahan harus bahan baku aktif. */
export async function setBom(tx: Tx, productId: string, lines: BomLineInput[]) {
  validateBomLines(lines);
  const product = await tx.item.findUnique({ where: { id: productId }, include: { product: { select: { type: true } } } });
  if (!product || product.kind !== "FINISHED") throw new StockRuleError("BOM hanya untuk barang jadi.");
  if (product.product?.type === "DAGANG" && lines.length > 0) throw new StockRuleError("Produk dagang dibeli jadi, tidak memakai BOM.");
  const mats = await tx.item.findMany({ where: { id: { in: lines.map((l) => l.materialId) } } });
  if (mats.length !== lines.length || mats.some((m) => m.kind !== "RAW")) {
    throw new StockRuleError("Semua bahan pada BOM harus berupa bahan baku yang terdaftar.");
  }
  await tx.bomLine.deleteMany({ where: { productId } });
  await tx.bomLine.createMany({ data: lines.map((l) => ({ productId, materialId: l.materialId, qty: l.qty })) });
}
