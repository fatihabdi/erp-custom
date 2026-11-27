import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_TERMS } from "../billing";
import { createInvoice, createOrderFromProject, projectTermPlan } from "../documents";
import { createProject } from "../project";
import { searchAll } from "../search";

// Tes integrasi: hanya berjalan bila DATABASE_URL tersedia (CI memakai service Postgres).
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("pencarian global (database)", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const tag = `Q${Date.now() % 1000000}`;
  const tx = <T,>(fn: (t: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(fn as never) as Promise<T>;
  let a = "", b = "", cust = "", item = "", prod = "";

  beforeAll(async () => {
    a = (await db.company.create({ data: { code: `A${tag}`, name: "PT A", ppnRate: 11 } })).id;
    b = (await db.company.create({ data: { code: `B${tag}`, name: "PT B", ppnRate: 0 } })).id;
    cust = (await db.customer.create({ data: { name: `${tag} Zebra Sejahtera`, contact: "Pak Kuda" } })).id;
    prod = (await db.product.create({ data: { code: `${tag}-P`, name: `${tag} Zebra Lemari`, unit: "unit", category: "KANTOR" } })).id;
    item = (await db.item.create({ data: { kind: "FINISHED", code: `${tag}-I`, name: "Lemari", unit: "unit", productId: prod } })).id;
    for (const companyId of [a, b]) {
      const p = await tx((t) => createProject(t, { kind: "ORDER", name: `${tag} proyek ${companyId === a ? "A" : "B"}`, companyId, customerId: cust, lines: [{ productId: item, qty: 2, unitPrice: 1_000_000 }] }));
      await tx((t) => createOrderFromProject(t, p.id, { terms: DEFAULT_TERMS }));
      const plan = await tx((t) => projectTermPlan(t, p.id));
      await tx((t) => createInvoice(t, { projectId: p.id, termId: plan.terms[0].id }));
    }
  });
  afterAll(async () => {
    const ids = [a, b];
    await db.invoice.deleteMany({ where: { companyId: { in: ids } } });
    await db.salesOrder.deleteMany({ where: { companyId: { in: ids } } });
    await db.paymentTerm.deleteMany({ where: { project: { companyId: { in: ids } } } });
    await db.project.deleteMany({ where: { companyId: { in: ids } } });
    await db.item.deleteMany({ where: { id: item } });
    await db.product.deleteMany({ where: { id: prod } });
    await db.customer.delete({ where: { id: cust } });
    await db.company.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  const kinds = (g: { kind: string }[]) => g.map((x) => x.kind);

  it("Direktur menemukan pelanggan, proyek, penawaran/KO/invoice/SO, dan produk dari satu kata kunci", async () => {
    const g = await searchAll({ role: "DIREKTUR", companies: [] }, `${tag} zebra`);
    expect(kinds(g)).toEqual(["pelanggan", "proyek", "order", "invoice", "sales-order", "produk"]);
    expect(g.find((x) => x.kind === "proyek")!.hits).toHaveLength(2);
    expect(g.find((x) => x.kind === "pelanggan")!.hits[0].href).toBe(`/pelanggan/${cust}`);
  });
  it("tidak peka huruf besar, mencari nomor dokumen, dan kata kunci pendek kosong", async () => {
    expect(await searchAll({ role: "DIREKTUR", companies: [] }, "z")).toEqual([]);
    const g = await searchAll({ role: "DIREKTUR", companies: [] }, `a${tag}-0`.toLowerCase());
    expect(kinds(g)).toContain("invoice");
  });
  it("pengguna terbatas perusahaan hanya melihat dokumen perusahaannya", async () => {
    const g = await searchAll({ role: "KEUANGAN", companies: [{ id: a }] }, `${tag} proyek`);
    const hits = g.find((x) => x.kind === "proyek")!.hits;
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toContain("proyek A");
    const inv = await searchAll({ role: "KEUANGAN", companies: [{ id: a }] }, `${tag} zebra`);
    expect(inv.find((x) => x.kind === "invoice")!.hits).toHaveLength(1);
  });
  it("peran tanpa hak modul tidak mendapat jenis itu (Ketua hanya Sales Order, Gudang tanpa pelanggan/invoice/produk)", async () => {
    expect(kinds(await searchAll({ role: "KETUA_KAYU", companies: [] }, `${tag} zebra`))).toEqual(["sales-order"]);
    expect(kinds(await searchAll({ role: "GUDANG", companies: [] }, `${tag} zebra`))).toEqual(["proyek", "sales-order"]);
    expect(kinds(await searchAll({ role: "MARKETING", companies: [] }, `${tag} zebra`))).not.toContain("laporan");
  });
});
