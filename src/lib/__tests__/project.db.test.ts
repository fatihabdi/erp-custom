import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { applyMovement, InsufficientStockError, setBom } from "../inventory";
import { addCost, cancelDelivery, cancelProject, createProject, deleteCost, issueMaterials, passQc, planDelivery, shipDelivery, updateStage } from "../project";
import { ProjectRuleError } from "../production";

// Tes integrasi: hanya berjalan bila DATABASE_URL tersedia (CI memakai service Postgres).
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("proyek (database)", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const tag = `P${Date.now() % 1000000}`;
  let besi = "", kayu = "", meja = "", sba = "", gtf = "", cust = "";
  const projects: string[] = [];
  const onHand = async (id: string) => Number((await db.item.findUniqueOrThrow({ where: { id } })).onHand);
  const tx = <T,>(fn: Parameters<typeof db.$transaction>[0]) => db.$transaction(fn as never) as Promise<T>;

  beforeAll(async () => {
    const mk = (kind: "RAW" | "FINISHED", code: string, unit: string, unitCost = 0) =>
      db.item.create({ data: { kind, code: `${tag}-${code}`, name: code, unit, unitCost } }).then((i) => i.id);
    besi = await mk("RAW", "BESI", "batang", 50_000);
    kayu = await mk("RAW", "KAYU", "lembar", 100_000);
    meja = await mk("FINISHED", "MEJA", "unit");
    await db.$transaction(async (t) => {
      await setBom(t, meja, [{ materialId: besi, qty: 2 }, { materialId: kayu, qty: 1 }]);
      await applyMovement(t, { itemId: besi, type: "MASUK", qty: 20 });
      await applyMovement(t, { itemId: kayu, type: "MASUK", qty: 7 }); // cukup untuk 7 unit saja
    });
    gtf = (await db.company.upsert({ where: { code: "GTF" }, update: {}, create: { code: "GTF", name: "GTF", ppnRate: 0 } })).id;
    sba = (await db.company.upsert({ where: { code: "SBA" }, update: {}, create: { code: "SBA", name: "SBA", ppnRate: 11 } })).id;
    cust = (await db.customer.create({ data: { name: `${tag} Pelanggan` } })).id;
  });
  afterAll(async () => {
    for (const id of projects) {
      await db.deliveryLine.deleteMany({ where: { delivery: { projectId: id } } });
      await db.project.delete({ where: { id } }).catch(() => {});
    }
    const ids = [besi, kayu, meja];
    await db.stockMovement.deleteMany({ where: { itemId: { in: ids } } });
    await db.projectLine.deleteMany({ where: { productId: meja } });
    await db.bomLine.deleteMany({ where: { productId: meja } });
    await db.item.deleteMany({ where: { id: { in: ids } } });
    await db.customer.delete({ where: { id: cust } });
    await db.$disconnect();
  });

  const order = async (qty: number, companyId = sba) => {
    const p = await tx<{ id: string }>((t) => createProject(t, {
      kind: "ORDER", name: `${tag} order`, companyId, customerId: cust, lines: [{ productId: meja, qty, unitPrice: 1_000_000 }],
    }));
    projects.push(p.id);
    const line = await db.projectLine.findFirstOrThrow({ where: { projectId: p.id } });
    return { id: p.id, lineId: line.id };
  };

  it("PPN mengikuti perusahaan dan pesanan wajib punya pelanggan", async () => {
    const a = await order(1, sba);
    const b = await order(1, gtf);
    expect(Number((await db.project.findUniqueOrThrow({ where: { id: a.id } })).ppnRate)).toBe(11);
    expect(Number((await db.project.findUniqueOrThrow({ where: { id: b.id } })).ppnRate)).toBe(0);
    await expect(tx((t) => createProject(t, { kind: "ORDER", name: "x", companyId: sba, lines: [{ productId: meja, qty: 1 }] })))
      .rejects.toBeInstanceOf(ProjectRuleError);
  });

  it("kode proyek berurutan dan unik", async () => {
    const a = await order(1);
    const b = await order(1);
    const [pa, pb] = await Promise.all([a, b].map((x) => db.project.findUniqueOrThrow({ where: { id: x.id } })));
    expect(pa.code).toMatch(/^PRY-\d{4}-\d{3}$/);
    expect(pa.code).not.toBe(pb.code);
  });

  it("alur penuh: bahan → tahap → QC masuk stok → kirim bertahap → selesai", async () => {
    const { id, lineId } = await order(4);
    const besi0 = await onHand(besi), kayu0 = await onHand(kayu);

    // Belum ada bahan keluar: rangka besi belum boleh jalan.
    await expect(tx((t) => updateStage(t, { lineId, stage: "RANGKA_BESI", done: 1 }))).rejects.toThrow(/keluarkan bahan/);

    const issued = await tx<{ cost: number }>((t) => issueMaterials(t, { lineId, units: 4 }));
    expect(issued.cost).toBe(4 * (2 * 50_000 + 100_000));
    expect(await onHand(besi)).toBe(besi0 - 8);
    expect(await onHand(kayu)).toBe(kayu0 - 4);
    await expect(tx((t) => issueMaterials(t, { lineId, units: 1 }))).rejects.toThrow(/0 unit lagi/);

    await tx((t) => updateStage(t, { lineId, stage: "RANGKA_BESI", done: 4 }));
    await tx((t) => updateStage(t, { lineId, stage: "POTONG_KAYU", done: 3 }));
    await expect(tx((t) => updateStage(t, { lineId, stage: "RAKIT", done: 4 }))).rejects.toThrow(/baru selesai 3/);
    await tx((t) => updateStage(t, { lineId, stage: "RAKIT", done: 3 }));
    await tx((t) => updateStage(t, { lineId, stage: "FINISHING", done: 3 }));

    // QC lulus: barang jadi masuk stok.
    expect(await onHand(meja)).toBe(0);
    await expect(tx((t) => passQc(t, { lineId, qty: 4 }))).rejects.toThrow(/Hanya 3 unit/);
    await tx((t) => passQc(t, { lineId, qty: 3 }));
    expect(await onHand(meja)).toBe(3);
    await tx((t) => updateStage(t, { lineId, stage: "PACKING", done: 3 }));

    // Pengiriman bertahap.
    const d1 = await tx<{ id: string }>((t) => planDelivery(t, { projectId: id, lines: [{ lineId, qty: 2 }] }));
    await expect(tx((t) => planDelivery(t, { projectId: id, lines: [{ lineId, qty: 3 }] }))).rejects.toThrow(/sisa pesanan \(2/);
    const d2 = await tx<{ id: string }>((t) => planDelivery(t, { projectId: id, lines: [{ lineId, qty: 2 }] }));
    await tx((t) => shipDelivery(t, { deliveryId: d1.id }));
    expect(await onHand(meja)).toBe(1);
    await expect(tx((t) => shipDelivery(t, { deliveryId: d1.id }))).rejects.toThrow(/sudah dikirim/);
    // Baru 1 unit yang masih siap kirim (3 dipacking, 2 terkirim).
    await expect(tx((t) => shipDelivery(t, { deliveryId: d2.id }))).rejects.toThrow(/Baru 1 unit/);
    expect(await onHand(meja)).toBe(1);

    expect((await db.project.findUniqueOrThrow({ where: { id } })).status).toBe("BERJALAN");
    await tx((t) => cancelDelivery(t, d2.id));
  });

  it("QC lulus idempoten terhadap stok: satu catatan QC = satu mutasi", async () => {
    const mutasi = await db.stockMovement.count({ where: { itemId: meja, type: "PRODUKSI_MASUK" } });
    expect(mutasi).toBeGreaterThan(0);
    const qcs = await db.qcRecord.count({ where: { line: { productId: meja } } });
    expect(mutasi).toBe(qcs);
  });

  it("bahan tidak cukup: tidak ada yang terpotong dan tidak ada catatan", async () => {
    const { lineId } = await order(10);
    const kayu0 = await onHand(kayu), besi0 = await onHand(besi);
    await expect(tx((t) => issueMaterials(t, { lineId, units: 10 }))).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await onHand(kayu)).toBe(kayu0);
    expect(await onHand(besi)).toBe(besi0);
    expect(await db.materialIssue.count({ where: { lineId } })).toBe(0);
    expect((await db.projectLine.findUniqueOrThrow({ where: { id: lineId } })).issuedUnits).toBe(0);
  });

  it("produksi stok tanpa pelanggan, berhenti di QC, selesai otomatis dan tidak bisa dikirim", async () => {
    const p = await tx<{ id: string }>((t) => createProject(t, { kind: "STOK", name: `${tag} stok`, lines: [{ productId: meja, qty: 1 }] }));
    projects.push(p.id);
    const row = await db.project.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.code).toMatch(/^STK-/);
    expect(row.customerId).toBeNull();
    const line = await db.projectLine.findFirstOrThrow({ where: { projectId: p.id } });
    const lineId = line.id;
    const before = await onHand(meja);
    await tx((t) => issueMaterials(t, { lineId, units: 1 }));
    for (const stage of ["RANGKA_BESI", "POTONG_KAYU", "RAKIT", "FINISHING"] as const) {
      await tx((t) => updateStage(t, { lineId, stage, done: 1 }));
    }
    await tx((t) => passQc(t, { lineId, qty: 1 }));
    expect(await onHand(meja)).toBe(before + 1);
    expect((await db.project.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("SELESAI");
    await expect(tx((t) => planDelivery(t, { projectId: p.id, lines: [{ lineId, qty: 1 }] }))).rejects.toThrow(/tidak berjalan|tidak dikirim/);
  });

  it("biaya manual, hapus hanya yang manual, dan batal proyek", async () => {
    const { id, lineId } = await order(1);
    const c = await tx<{ id: string }>((t) => addCost(t, { projectId: id, category: "TENAGA", description: "Upah tukang", amount: 500_000 }));
    await expect(tx((t) => addCost(t, { projectId: id, category: "LAIN", description: "x", amount: 0 }))).rejects.toThrow(ProjectRuleError);
    await tx((t) => deleteCost(t, c.id));
    expect(await db.projectCost.count({ where: { projectId: id } })).toBe(0);
    await tx((t) => cancelProject(t, id));
    expect((await db.project.findUniqueOrThrow({ where: { id } })).status).toBe("BATAL");
    await expect(tx((t) => updateStage(t, { lineId, stage: "RAKIT", done: 0 }))).rejects.toThrow(/tidak berjalan/);

    const used = await order(1);
    await tx((t) => issueMaterials(t, { lineId: used.lineId, units: 1 }));
    await expect(tx((t) => cancelProject(t, used.id))).rejects.toThrow(/sudah memakai bahan/);
    const auto = await db.projectCost.findFirstOrThrow({ where: { projectId: used.id } });
    await expect(tx((t) => deleteCost(t, auto.id))).rejects.toThrow(/tidak bisa dihapus/);
  });

  it("dua permintaan QC bersamaan tidak melebihi unit yang siap", async () => {
    const { lineId } = await order(1);
    // stok bahan kayu terbatas; tambah supaya cukup
    await db.$transaction((t) => applyMovement(t, { itemId: kayu, type: "MASUK", qty: 5 }));
    await db.$transaction((t) => applyMovement(t, { itemId: besi, type: "MASUK", qty: 5 }));
    await tx((t) => issueMaterials(t, { lineId, units: 1 }));
    for (const stage of ["RANGKA_BESI", "POTONG_KAYU", "RAKIT", "FINISHING"] as const) {
      await tx((t) => updateStage(t, { lineId, stage, done: 1 }));
    }
    const before = await onHand(meja);
    const r = await Promise.allSettled([tx((t) => passQc(t, { lineId, qty: 1 })), tx((t) => passQc(t, { lineId, qty: 1 }))]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await onHand(meja)).toBe(before + 1);
  });
});
