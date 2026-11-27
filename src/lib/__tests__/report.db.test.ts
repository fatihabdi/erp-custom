import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_TERMS } from "../billing";
import { createInvoice, createOrderFromProject, projectTermPlan, recordPayment } from "../documents";
import { addCost, createProject } from "../project";
import { BUILDERS, type BuildCtx } from "../report/build";
import { parsePeriod, resolveScope } from "../report/filters";
import type { ReportData, ReportSection } from "../report/types";

// Tes integrasi: hanya berjalan bila DATABASE_URL tersedia (CI memakai service Postgres).
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("laporan (database)", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const tag = `R${Date.now() % 1000000}`;
  const NOW = new Date("2026-11-27T05:00:00Z");
  const tx = <T,>(fn: (t: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(fn as never) as Promise<T>;
  let sba = { id: "", code: "" }, gtf = { id: "", code: "" };
  let cust = "", sekolahItem = "", dagangItem = "";
  let projectId = "";
  const ctxFor = (companies: { id: string; code: string }[], role = "DIREKTUR", dari = "2026-01-01", sampai = "2026-11-30", pt?: string): BuildCtx =>
    ({ scope: resolveScope(role, companies, pt), period: parsePeriod(dari, sampai, NOW), now: NOW });
  const section = (r: ReportData, title: string): ReportSection => r.sections.find((s) => s.title === title)!;

  beforeAll(async () => {
    const s = await db.company.create({ data: { code: `S${tag}`, name: "SBA tes", ppnRate: 11, bankName: "BCA", bankAccount: "123", bankHolder: "PT SBA" } });
    const g = await db.company.create({ data: { code: `G${tag}`, name: "GTF tes", ppnRate: 0 } });
    sba = { id: s.id, code: s.code }; gtf = { id: g.id, code: g.code };
    cust = (await db.customer.create({ data: { name: `${tag} Sekolah Harapan`, taxId: "01.234.567.8-901.000" } })).id;
    const meja = await db.product.create({ data: { code: `${tag}-P1`, name: "Meja siswa", category: "SEKOLAH", type: "PRODUKSI", unit: "set", price: 1_000_000 } });
    const printer = await db.product.create({ data: { code: `${tag}-P2`, name: "Printer", category: "KANTOR", type: "DAGANG", unit: "unit", price: 2_000_000, cost: 500_000 } });
    sekolahItem = (await db.item.create({ data: { kind: "FINISHED", code: `${tag}-I1`, name: "Meja siswa", unit: "set", productId: meja.id } })).id;
    dagangItem = (await db.item.create({ data: { kind: "FINISHED", code: `${tag}-I2`, name: "Printer", unit: "unit", productId: printer.id } })).id;

    // Pesanan SBA: 10 meja @1 jt + 2 printer @2 jt = 14 jt DPP, PPN 11%. DP 30% terbit 1 Sep (lewat tempo), dibayar 2 jt dari 4.662.000.
    const proj = await tx((t) => createProject(t, { kind: "ORDER", name: `${tag} proyek`, companyId: sba.id, customerId: cust, orderDate: new Date("2026-08-20T05:00:00Z"), lines: [{ productId: sekolahItem, qty: 10, unitPrice: 1_000_000 }, { productId: dagangItem, qty: 2, unitPrice: 2_000_000 }] }));
    projectId = proj.id;
    await tx((t) => createOrderFromProject(t, projectId, { terms: DEFAULT_TERMS, date: new Date("2026-08-25T05:00:00Z") }));
    const plan = await tx((t) => projectTermPlan(t, projectId));
    const dp = await tx((t) => createInvoice(t, { projectId, termId: plan.terms[0].id, date: new Date("2026-09-01T05:00:00Z") }));
    await tx((t) => recordPayment(t, { invoiceId: dp.id, amount: 2_000_000, date: new Date("2026-09-03T05:00:00Z") }));
    await tx((t) => addCost(t, { projectId, category: "LAIN", description: "Ongkos kirim", amount: 200_000 }));
    // Pesanan GTF tanpa PPN, belum ditagih.
    const p2 = await tx((t) => createProject(t, { kind: "ORDER", name: `${tag} gtf`, companyId: gtf.id, customerId: cust, orderDate: new Date("2026-10-05T05:00:00Z"), lines: [{ productId: sekolahItem, qty: 4, unitPrice: 1_000_000 }] }));
    await tx((t) => createOrderFromProject(t, p2.id, { terms: DEFAULT_TERMS, date: new Date("2026-10-06T05:00:00Z") }));
  });

  afterAll(async () => {
    const ids = [sba.id, gtf.id];
    await db.payment.deleteMany({ where: { invoice: { companyId: { in: ids } } } });
    await db.invoice.deleteMany({ where: { companyId: { in: ids } } });
    await db.salesOrder.deleteMany({ where: { companyId: { in: ids } } });
    await db.paymentTerm.deleteMany({ where: { project: { companyId: { in: ids } } } });
    await db.project.deleteMany({ where: { companyId: { in: ids } } });
    await db.item.deleteMany({ where: { id: { in: [sekolahItem, dagangItem] } } });
    await db.product.deleteMany({ where: { code: { startsWith: tag } } });
    await db.customer.delete({ where: { id: cust } });
    await db.company.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("penjualan: DPP, PPN, bulan, dan kategori cocok dengan invoice terbit", async () => {
    const r = await BUILDERS.penjualan(ctxFor([sba, gtf]));
    // DP 30% dari 14 jt = 4,2 jt DPP, PPN 462 rb.
    expect(r.summary[0].value).toBe(4_200_000);
    expect(r.summary[1].value).toBe(462_000);
    expect(r.summary[3].value).toBe(1);
    expect(section(r, "Per bulan").rows).toMatchObject([{ name: "Sep 2026", count: 1, dpp: 4_200_000 }]);
    const cat = Object.fromEntries(section(r, "Per kategori produk").rows.map((x) => [x.name, x.dpp]));
    expect(Number(cat.Sekolah) + Number(cat.Kantor)).toBeCloseTo(4_200_000, 2);
    expect(Number(cat.Sekolah)).toBeCloseTo(3_000_000, 0); // 10 jt dari 14 jt
    expect(section(r, "Per perusahaan").rows).toHaveLength(1);
    // Di luar periode: kosong.
    expect((await BUILDERS.penjualan(ctxFor([sba, gtf], "DIREKTUR", "2026-10-01", "2026-11-30"))).summary[3].value).toBe(0);
  });

  it("piutang: sisa DP masuk kelompok umur 61-90 hari dan daftar jatuh tempo", async () => {
    const r = await BUILDERS.piutang(ctxFor([sba, gtf]));
    // Sisa DP = 4.662.000 - 2.000.000, invoice berumur 87 hari.
    const aging = section(r, "Umur piutang").rows;
    const total = aging.reduce((n, x) => n + Number(x.left), 0);
    expect(total).toBe(2_662_000);
    expect(r.summary[0].value).toBe(2_662_000);
    expect(aging.map((x) => x.count)).toEqual([0, 0, 1, 0]);
    expect(section(r, "Jatuh tempo").rows[0].status).toMatch(/^Terlambat \d+ hari$/);
  });

  it("kas: pembayaran 2 jt tercatat sebagai DP, per rekening transfer SBA", async () => {
    const r = await BUILDERS.kas(ctxFor([sba, gtf]));
    expect(r.summary[0].value).toBe(2_000_000);
    expect(r.summary[1].value).toBe(2_000_000);
    expect(section(r, "Per rekening").rows[0].name).toContain("BCA 123 a.n. PT SBA");
    expect(section(r, "Daftar penerimaan").rows).toHaveLength(1);
  });

  it("margin: kontrak dikurangi biaya lain dan HPP produk dagang dari master produk", async () => {
    const r = await BUILDERS.margin(ctxFor([sba, gtf]));
    const row = (name: string) => section(r, "Margin per proyek").rows.find((x) => String(x.project).includes(name))!;
    const sbaRow = row(`${tag} proyek`);
    expect(sbaRow).toMatchObject({ contract: 14_000_000, other: 200_000, trade: 1_000_000, cost: 1_200_000, margin: 12_800_000 });
    expect(row(`${tag} gtf`)).toMatchObject({ contract: 4_000_000, cost: 0, margin: 4_000_000 });
    expect(r.summary[0].value).toBe(18_000_000);
    expect((await BUILDERS.margin(ctxFor([sba, gtf], "DIREKTUR", "2026-09-01", "2026-11-30"))).summary[0].value).toBe(4_000_000);
  });

  it("DP & termin: DP lewat jatuh tempo (sebagian dibayar) dan termin yang belum ditagih", async () => {
    const r = await BUILDERS.termin(ctxFor([sba, gtf]));
    const rows = section(r, "DP dan termin belum lunas").rows.filter((x) => x.company === sba.code || x.company === gtf.code);
    const dp = rows.find((x) => x.company === sba.code && x.kind === "DP")!;
    expect(dp.state).toBe("Lewat jatuh tempo");
    expect(dp).toMatchObject({ amount: 4_662_000, left: 2_662_000 });
    const gtfRows = rows.filter((x) => x.company === gtf.code);
    expect(gtfRows.map((x) => x.state)).toEqual(["Belum ditagih", "Belum ditagih"]);
    expect(gtfRows[0].amount).toBe(1_200_000); // 30% dari 4 jt, GTF tanpa PPN
    // Urutan: yang lewat jatuh tempo lebih dulu.
    expect(rows[0].state).toBe("Lewat jatuh tempo");
  });

  it("PPN keluaran: hanya perusahaan kena PPN; GTF kosong", async () => {
    const r = await BUILDERS.ppn(ctxFor([sba, gtf]));
    expect(r.summary[0].value).toBe(4_200_000);
    expect(r.summary[1].value).toBe(462_000);
    expect(section(r, "Daftar invoice").rows[0]).toMatchObject({ npwp: "01.234.567.8-901.000", rate: 11, ppn: 462_000 });
    const g = await BUILDERS.ppn(ctxFor([sba, gtf], "KEUANGAN", "2026-01-01", "2026-11-30", gtf.code));
    expect(g.summary[1].value).toBe(0);
    expect(section(g, "Per bulan").rows).toHaveLength(0);
  });

  it("peran non-Direktur hanya melihat satu perusahaan", async () => {
    const r = await BUILDERS.penjualan(ctxFor([sba, gtf], "KEUANGAN", "2026-01-01", "2026-11-30", sba.code));
    expect(r.scopeLabel).toBe(sba.code);
    const other = await BUILDERS.penjualan(ctxFor([gtf], "KEUANGAN", "2026-01-01", "2026-11-30", sba.code));
    expect(other.summary[0].value).toBe(0); // permintaan SBA diabaikan, dipaksa ke GTF
  });
});
