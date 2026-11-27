import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import {
  applyMovement, InsufficientStockError, issueMaterialsForProduction, nextItemCode,
  receiveFinishedGoodsAtQc, setBom, shipFinishedGoods,
} from "../inventory";
import { StockRuleError } from "../stock";

// Tes integrasi: hanya berjalan bila DATABASE_URL tersedia (CI memakai service Postgres).
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("inventory (database)", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const tag = `T${Date.now() % 1000000}`;
  let besi = "", kayu = "", meja = "";
  const onHand = async (id: string) => Number((await db.item.findUniqueOrThrow({ where: { id } })).onHand);

  beforeAll(async () => {
    const mk = (kind: "RAW" | "FINISHED", code: string, unit: string) =>
      db.item.create({ data: { kind, code: `${tag}-${code}`, name: code, unit } }).then((i) => i.id);
    besi = await mk("RAW", "BESI", "batang");
    kayu = await mk("RAW", "KAYU", "lembar");
    meja = await mk("FINISHED", "MEJA", "unit");
  });
  afterAll(async () => {
    const ids = [besi, kayu, meja];
    await db.stockMovement.deleteMany({ where: { itemId: { in: ids } } });
    await db.bomLine.deleteMany({ where: { productId: meja } });
    await db.item.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("stok masuk menambah saldo dan mencatat riwayat", async () => {
    const r = await db.$transaction((t) => applyMovement(t, { itemId: besi, type: "MASUK", qty: 20, note: "stok awal" }));
    expect(r.duplicate).toBe(false);
    expect(Number(r.movement.balanceAfter)).toBe(20);
    expect(await onHand(besi)).toBe(20);
  });

  it("stok keluar melebihi saldo ditolak dan saldo tidak berubah", async () => {
    await expect(db.$transaction((t) => applyMovement(t, { itemId: besi, type: "KELUAR", qty: 21 })))
      .rejects.toBeInstanceOf(InsufficientStockError);
    expect(await onHand(besi)).toBe(20);
  });

  it("penyesuaian wajib beralasan dan boleh negatif", async () => {
    await expect(db.$transaction((t) => applyMovement(t, { itemId: besi, type: "PENYESUAIAN", qty: -1 })))
      .rejects.toBeInstanceOf(StockRuleError);
    const r = await db.$transaction((t) => applyMovement(t, { itemId: besi, type: "PENYESUAIAN", qty: -2, note: "hasil hitung fisik" }));
    expect(Number(r.movement.qty)).toBe(-2);
    expect(await onHand(besi)).toBe(18);
  });

  it("jenis mutasi dicocokkan dengan jenis barang", async () => {
    await expect(db.$transaction((t) => applyMovement(t, { itemId: besi, type: "PRODUKSI_MASUK", qty: 1 })))
      .rejects.toBeInstanceOf(StockRuleError);
    await expect(db.$transaction((t) => applyMovement(t, { itemId: meja, type: "PEMAKAIAN_BAHAN", qty: 1 })))
      .rejects.toBeInstanceOf(StockRuleError);
  });

  it("QC lulus menambah stok barang jadi sekali saja (idempoten)", async () => {
    const run = () => db.$transaction((t) => receiveFinishedGoodsAtQc(t, { productId: meja, qty: 5, qcId: `${tag}-qc1` }));
    const a = await run();
    const b = await run();
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(await onHand(meja)).toBe(5);
  });

  it("dua permintaan bersamaan tidak membuat saldo negatif", async () => {
    await db.$transaction((t) => applyMovement(t, { itemId: kayu, type: "MASUK", qty: 5 }));
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => db.$transaction((t) => applyMovement(t, { itemId: kayu, type: "KELUAR", qty: 2 }))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await onHand(kayu)).toBe(1);
  });

  it("pengiriman mengurangi barang jadi dan menolak kelebihan", async () => {
    await db.$transaction((t) => shipFinishedGoods(t, { productId: meja, qty: 3, deliveryId: `${tag}-d1` }));
    expect(await onHand(meja)).toBe(2);
    await expect(db.$transaction((t) => shipFinishedGoods(t, { productId: meja, qty: 3, deliveryId: `${tag}-d2` })))
      .rejects.toBeInstanceOf(InsufficientStockError);
    expect(await onHand(meja)).toBe(2);
  });

  it("BOM: bahan dipakai sesuai kebutuhan; kekurangan membatalkan semuanya", async () => {
    await db.$transaction((t) => setBom(t, meja, [{ materialId: besi, qty: 4 }, { materialId: kayu, qty: 0.5 }]));
    // besi 18, kayu 1: 2 unit butuh besi 8, kayu 1 -> cukup
    await db.$transaction((t) => issueMaterialsForProduction(t, { productId: meja, units: 2, productionId: `${tag}-p1` }));
    expect(await onHand(besi)).toBe(10);
    expect(await onHand(kayu)).toBe(0);
    // 5 unit butuh besi 20 (ada 10) dan kayu 2.5 (ada 0): tidak ada yang dipotong
    const err = await db
      .$transaction((t) => issueMaterialsForProduction(t, { productId: meja, units: 5, productionId: `${tag}-p2` }))
      .catch((e) => e);
    expect(err).toBeInstanceOf(InsufficientStockError);
    expect((err as InsufficientStockError).shortages).toHaveLength(2);
    expect(await onHand(besi)).toBe(10);
    // dipanggil ulang untuk produksi yang sama tidak memotong dua kali
    await db.$transaction((t) => issueMaterialsForProduction(t, { productId: meja, units: 2, productionId: `${tag}-p1` }).catch(() => null));
    expect(await onHand(besi)).toBe(10);
  });

  it("BOM hanya menerima bahan baku", async () => {
    await expect(db.$transaction((t) => setBom(t, meja, [{ materialId: meja, qty: 1 }]))).rejects.toBeInstanceOf(StockRuleError);
  });

  it("kode barang berurutan per jenis", async () => {
    const code = await db.$transaction((t) => nextItemCode(t, "FINISHED"));
    expect(code).toMatch(/^BJ-\d{3,}$/);
  });

  describe("rincian mutasi", () => {
    it("stok masuk menyimpan harga, pemasok, rujukan, tanggal dan memperbarui harga pokok rata-rata", async () => {
      const when = new Date("2026-11-01T05:00:00Z");
      const baru = await db.item.create({ data: { kind: "RAW", code: `${tag}-PAKU`, name: "Paku", unit: "kg" } });
      try {
        await db.$transaction((t) => applyMovement(t, { itemId: baru.id, type: "MASUK", qty: 10, unitCost: 100, supplier: "Toko A", reference: "NOTA-1", occurredAt: when }));
        const r = await db.$transaction((t) => applyMovement(t, { itemId: baru.id, type: "MASUK", qty: 10, unitCost: 200 }));
        expect(Number(r.movement.unitCost)).toBe(200);
        const first = await db.stockMovement.findFirstOrThrow({ where: { itemId: baru.id, reference: "NOTA-1" } });
        expect(first.supplier).toBe("Toko A");
        expect(first.occurredAt.toISOString()).toBe(when.toISOString());
        expect(Number((await db.item.findUniqueOrThrow({ where: { id: baru.id } })).unitCost)).toBe(150);
      } finally {
        await db.stockMovement.deleteMany({ where: { itemId: baru.id } });
        await db.item.delete({ where: { id: baru.id } });
      }
    });

    it("menolak tanggal masa depan serta harga/pemasok pada stok keluar", async () => {
      const future = new Date(Date.now() + 10 * 86_400_000);
      await expect(db.$transaction((t) => applyMovement(t, { itemId: besi, type: "MASUK", qty: 1, occurredAt: future }))).rejects.toThrow(StockRuleError);
      await expect(db.$transaction((t) => applyMovement(t, { itemId: besi, type: "KELUAR", qty: 1, unitCost: 5 }))).rejects.toThrow(StockRuleError);
      await expect(db.$transaction((t) => applyMovement(t, { itemId: besi, type: "KELUAR", qty: 1, supplier: "X" }))).rejects.toThrow(StockRuleError);
    });

    it("stok keluar untuk proyek menyimpan rujukan proyek; proyek tidak ada ditolak", async () => {
      await expect(db.$transaction((t) => applyMovement(t, { itemId: besi, type: "KELUAR", qty: 1, projectId: "tidak-ada" }))).rejects.toThrow("Proyek tujuan");
      const p = await db.project.create({ data: { code: `${tag}-PRY`, kind: "STOK", name: "Uji" } });
      try {
        await db.$transaction((t) => applyMovement(t, { itemId: besi, type: "MASUK", qty: 5 }));
        const r = await db.$transaction((t) => applyMovement(t, { itemId: besi, type: "KELUAR", qty: 2, projectId: p.id }));
        expect(r.movement.refType).toBe("PROYEK");
        expect(r.movement.refId).toBe(p.id);
      } finally {
        await db.stockMovement.deleteMany({ where: { refType: "PROYEK", refId: p.id } });
        await db.project.delete({ where: { id: p.id } });
      }
    });

    it("stok opname: selisih dihitung dari saldo, sama dengan saldo ditolak", async () => {
      const cur = await onHand(besi);
      const r = await db.$transaction((t) => applyMovement(t, { itemId: besi, type: "PENYESUAIAN", qty: 0, countedQty: cur + 3, note: "hitung fisik" }));
      expect(Number(r.movement.qty)).toBe(3);
      expect(await onHand(besi)).toBe(cur + 3);
      await expect(db.$transaction((t) => applyMovement(t, { itemId: besi, type: "PENYESUAIAN", qty: 0, countedQty: cur + 3, note: "lagi" }))).rejects.toThrow(StockRuleError);
      await expect(db.$transaction((t) => applyMovement(t, { itemId: besi, type: "MASUK", qty: 1, countedQty: 5 }))).rejects.toThrow(StockRuleError);
    });
  });
});
