import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_TERMS } from "../billing";
import { convertQuotationToOrder, createOrderFromProject, createQuotation, setQuotationStatus } from "../documents";
import { createProject } from "../project";
import { createProductionOrder, updateProductionOrder } from "../sales-order";

// Tes integrasi: hanya berjalan bila DATABASE_URL tersedia (CI memakai service Postgres).
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("sales order (database)", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const tag = `SO${Date.now() % 1000000}`;
  let co = "", cust = "", meja = "", lemari = "";
  const tx = <T,>(fn: (t: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(fn as never) as Promise<T>;
  const day = new Date("2026-11-18T05:00:00Z");

  beforeAll(async () => {
    co = (await db.company.create({ data: { code: `S${tag}`, name: "SO tes", ppnRate: 0 } })).id;
    cust = (await db.customer.create({ data: { name: `${tag} Pelanggan`, address: "Jl. Contoh 1" } })).id;
    meja = (await db.item.create({ data: { kind: "FINISHED", code: `${tag}-MEJA`, name: "Meja katalog", unit: "unit" } })).id;
    lemari = (await db.item.create({ data: { kind: "FINISHED", code: `${tag}-LMR`, name: "Lemari katalog", unit: "unit" } })).id;
  });
  afterAll(async () => {
    await db.salesOrder.deleteMany({ where: { companyId: co } });
    await db.quotation.deleteMany({ where: { companyId: co } });
    await db.paymentTerm.deleteMany({ where: { project: { companyId: co } } });
    await db.project.deleteMany({ where: { companyId: co } });
    await db.item.deleteMany({ where: { id: { in: [meja, lemari] } } });
    await db.customer.delete({ where: { id: cust } });
    await db.company.delete({ where: { id: co } });
    await db.$disconnect();
  });

  it("KO dari penawaran menerbitkan SO otomatis dengan nama dan spesifikasi dari penawaran", async () => {
    const q = await tx((t) => createQuotation(t, {
      companyId: co, customerId: cust, date: day, subject: "Meja sekolah", terms: DEFAULT_TERMS,
      lines: [
        { description: "Meja Serbaguna", spec: "P. 120 x L.60 x T.75 cm\nHPL, Edging", qty: 9, unit: "Unit", unitPrice: 1_000_000 },
        { description: "Lemari Arsip", qty: 2, unit: "Unit", unitPrice: 2_000_000 },
      ],
    }));
    await tx((t) => setQuotationStatus(t, q.id, "TERKIRIM"));
    const full = await db.quotation.findUniqueOrThrow({ where: { id: q.id }, include: { lines: { orderBy: { sort: "asc" } } } });
    const { order } = await tx((t) => convertQuotationToOrder(t, q.id, {
      date: day, productIds: { [full.lines[0].id]: meja, [full.lines[1].id]: lemari },
    }));
    const so = await db.productionOrder.findUniqueOrThrow({ where: { orderId: order.id }, include: { lines: { orderBy: { sort: "asc" }, include: { projectLine: true } } } });
    expect(so.number).toBe(order.number.replace("/KO/", "/SO/"));
    expect(so.companyId).toBe(co);
    expect(so.lines.map((l) => l.title)).toEqual(["Meja Serbaguna", "Lemari Arsip"]);
    expect(so.lines[0].spec).toBe("P. 120 x L.60 x T.75 cm\nHPL, Edging");
    expect(so.lines[1].spec).toBeNull();
    expect(so.lines.map((l) => l.projectLine.qty)).toEqual([9, 2]);
    expect(so.lines.map((l) => l.projectLine.productId)).toEqual([meja, lemari]);
  });

  it("KO dari proyek yang ada juga menerbitkan SO, memakai nama barang katalog; terbit sekali saja", async () => {
    const proj = await tx((t) => createProject(t, { kind: "ORDER", name: `${tag} proyek`, companyId: co, customerId: cust, lines: [{ productId: meja, qty: 4, unitPrice: 1_000_000 }] }));
    const order = await tx((t) => createOrderFromProject(t, proj.id, { terms: DEFAULT_TERMS, date: day }));
    const so = await db.productionOrder.findUniqueOrThrow({ where: { orderId: order.id }, include: { lines: true } });
    expect(so.lines.map((l) => l.title)).toEqual(["Meja katalog"]);
    const again = await tx((t) => createProductionOrder(t, order.id));
    expect(again.id).toBe(so.id);
    expect(await db.productionOrderLine.count({ where: { orderId: so.id } })).toBe(1);
  });

  it("ubah SO: nama, spesifikasi, catatan; menolak nama kosong dan barang dari SO lain", async () => {
    const so = await db.productionOrder.findFirstOrThrow({ where: { companyId: co }, include: { lines: true } });
    const line = so.lines[0];
    await tx((t) => updateProductionOrder(t, so.id, { notes: " Kirim pagi ", lines: [{ id: line.id, title: " Meja Baru ", spec: "  Multipleks  " }] }));
    const after = await db.productionOrder.findUniqueOrThrow({ where: { id: so.id }, include: { lines: true } });
    expect(after.notes).toBe("Kirim pagi");
    expect(after.lines.find((l) => l.id === line.id)).toMatchObject({ title: "Meja Baru", spec: "Multipleks" });
    await expect(tx((t) => updateProductionOrder(t, so.id, { lines: [{ id: line.id, title: " " }] }))).rejects.toThrow(/Nama barang/);
    const other = await db.productionOrderLine.findFirstOrThrow({ where: { orderId: { not: so.id }, order: { companyId: co } } });
    await expect(tx((t) => updateProductionOrder(t, so.id, { lines: [{ id: other.id, title: "x" }] }))).rejects.toThrow(/tidak ada di Sales Order/);
  });

  it("gambar tersimpan per barang dan ikut terhapus bersama SO", async () => {
    const so = await db.productionOrder.findFirstOrThrow({ where: { companyId: co }, include: { lines: true } });
    const lineId = so.lines[0].id;
    await db.productionOrderImage.create({ data: { lineId, data: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), mime: "image/jpeg" } });
    await db.salesOrder.delete({ where: { id: so.orderId } });
    expect(await db.productionOrderImage.count({ where: { lineId } })).toBe(0);
    expect(await db.productionOrder.count({ where: { id: so.id } })).toBe(0);
  });
});
