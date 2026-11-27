import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_TERMS, DocumentRuleError } from "../billing";
import {
  convertQuotationToOrder, createInvoice, createOrderFromProject, createQuotation, paidOf, projectTermPlan, recordPayment,
  setProjectTerms, setQuotationStatus, updateQuotation, voidInvoice, voidPayment,
} from "../documents";
import { createProject } from "../project";

// Tes integrasi: hanya berjalan bila DATABASE_URL tersedia (CI memakai service Postgres).
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("dokumen (database)", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const tag = `D${Date.now() % 1000000}`;
  let meja = "", sba = "", gtf = "", cust = "";
  const tx = <T,>(fn: (t: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(fn as never) as Promise<T>;
  const lines = [{ description: "Meja & Kursi", qty: 12, unit: "Set", unitPrice: 1_650_000 }, { description: "Lemari", qty: 3, unit: "Unit", unitPrice: 2_500_000 }];
  const day = new Date("2026-11-18T05:00:00Z");

  beforeAll(async () => {
    // Perusahaan khusus tes supaya urutan nomor tidak bercampur dengan data lain.
    sba = (await db.company.create({ data: { code: `S${tag}`, name: "SBA tes", ppnRate: 11 } })).id;
    gtf = (await db.company.create({ data: { code: `G${tag}`, name: "GTF tes", ppnRate: 0 } })).id;
    cust = (await db.customer.create({ data: { name: `${tag} Pelanggan` } })).id;
    meja = (await db.item.create({ data: { kind: "FINISHED", code: `${tag}-MEJA`, name: "Meja tes", unit: "set" } })).id;
  });
  afterAll(async () => {
    const companyIds = [sba, gtf];
    await db.payment.deleteMany({ where: { invoice: { companyId: { in: companyIds } } } });
    await db.invoice.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.salesOrder.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.quotation.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.paymentTerm.deleteMany({ where: { project: { companyId: { in: companyIds } } } });
    await db.project.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.projectLine.deleteMany({ where: { productId: meja } });
    await db.item.deleteMany({ where: { id: meja } });
    await db.customer.delete({ where: { id: cust } });
    await db.company.deleteMany({ where: { id: { in: companyIds } } });
    await db.$disconnect();
  });

  const quote = (companyId = sba, extra: object = {}) =>
    tx((t) => createQuotation(t, { companyId, customerId: cust, date: day, subject: "Meja", lines, terms: DEFAULT_TERMS, ...extra }));

  it("penawaran: PPN dibekukan dari perusahaan; nomor SPH bentrok di hari yang sama diberi -2", async () => {
    const a = await quote(sba);
    const b = await quote(sba);
    expect(a.number).toBe(`S${tag}.018/SPH/XI/2026`);
    expect(b.number).toBe(`S${tag}.018/SPH/XI/2026-2`);
    expect(Number(a.ppnRate)).toBe(11);
    expect(Number((await quote(gtf)).ppnRate)).toBe(0);
  });

  it("penawaran: validasi termin, baris, dan hanya draf yang boleh diubah", async () => {
    await expect(quote(sba, { terms: [{ label: "DP", trigger: "x", percent: 30, dueDays: 7 }] })).rejects.toThrow(/100%/);
    await expect(quote(sba, { lines: [] })).rejects.toThrow(DocumentRuleError);
    await expect(quote(sba, { subject: " " })).rejects.toThrow();
    const q = await quote(sba);
    await tx((t) => updateQuotation(t, q.id, { customerId: cust, subject: "Baru", lines: [lines[0]], terms: DEFAULT_TERMS }));
    expect((await db.quotation.findUniqueOrThrow({ where: { id: q.id }, include: { lines: true } })).lines).toHaveLength(1);
    await tx((t) => setQuotationStatus(t, q.id, "TERKIRIM"));
    await expect(tx((t) => updateQuotation(t, q.id, { customerId: cust, subject: "x", lines, terms: DEFAULT_TERMS }))).rejects.toThrow(/draf/);
    await expect(tx((t) => setQuotationStatus(t, q.id, "TERKIRIM"))).rejects.toThrow();
    await tx((t) => setQuotationStatus(t, q.id, "DITOLAK"));
    await expect(tx((t) => convertQuotationToOrder(t, q.id, { productIds: {} }))).rejects.toThrow(/ditolak/);
  });

  it("penawaran → KO: butuh barang katalog, membuat proyek, termin, dan nomor KO berurutan", async () => {
    const q = await quote(sba);
    await tx((t) => setQuotationStatus(t, q.id, "TERKIRIM"));
    await expect(tx((t) => convertQuotationToOrder(t, q.id, { productIds: {} }))).rejects.toThrow(/katalog/);
    const full = await db.quotation.findUniqueOrThrow({ where: { id: q.id }, include: { lines: { orderBy: { sort: "asc" } } } });
    const map = Object.fromEntries(full.lines.map((l) => [l.id, meja]));
    const { order, projectId } = await tx((t) => convertQuotationToOrder(t, q.id, { date: day, productIds: map, workDays: 14, dueDate: new Date("2026-12-05T00:00:00Z") }));
    expect(order.number).toMatch(new RegExp(`^S${tag}-\\d{3}/KO/XI/2026$`));
    const p = await db.project.findUniqueOrThrow({ where: { id: projectId }, include: { lines: true, terms: true } });
    expect(p.kind).toBe("ORDER");
    expect(p.orderRef).toBe(order.number);
    expect(Number(p.ppnRate)).toBe(11);
    expect(p.lines.map((l) => l.qty).sort()).toEqual([12, 3]);
    expect(p.terms.map((t) => Number(t.percent))).toEqual([30, 70]);
    expect((await db.quotation.findUniqueOrThrow({ where: { id: q.id } })).status).toBe("DISETUJUI");
    await expect(tx((t) => convertQuotationToOrder(t, q.id, { productIds: map }))).rejects.toThrow(/sudah menjadi/);
    await expect(tx((t) => setQuotationStatus(t, q.id, "BATAL"))).rejects.toThrow();
  });

  it("KO dari proyek yang ada; proyek tanpa pelanggan atau sudah punya KO ditolak", async () => {
    const proj = await tx((t) => createProject(t, { kind: "ORDER", name: `${tag} gtf`, companyId: gtf, customerId: cust, lines: [{ productId: meja, qty: 10, unitPrice: 1_850_000 }] }));
    await expect(tx((t) => createOrderFromProject(t, proj.id, {}))).rejects.toThrow(/termin/i);
    const so = await tx((t) => createOrderFromProject(t, proj.id, { terms: DEFAULT_TERMS, date: day }));
    expect(so.number).toMatch(new RegExp(`^G${tag}-\\d{3}/KO/XI/2026$`));
    await expect(tx((t) => createOrderFromProject(t, proj.id, {}))).rejects.toThrow(/sudah punya/);
    const stok = await tx((t) => createProject(t, { kind: "STOK", name: `${tag} stok`, lines: [{ productId: meja, qty: 1 }] }));
    await expect(tx((t) => createOrderFromProject(t, stok.id, { terms: DEFAULT_TERMS }))).rejects.toThrow(/pesanan pelanggan/);
    await db.project.delete({ where: { id: stok.id } }).catch(() => {});
  });

  describe("invoice dan pembayaran", () => {
    let projectId = "";
    let terms: { id: string; label: string }[] = [];
    beforeAll(async () => {
      const q = await quote(sba);
      const full = await db.quotation.findUniqueOrThrow({ where: { id: q.id }, include: { lines: true } });
      const r = await tx((t) => convertQuotationToOrder(t, q.id, { date: day, productIds: Object.fromEntries(full.lines.map((l) => [l.id, meja])) }));
      projectId = r.projectId;
      terms = (await tx((t) => projectTermPlan(t, projectId))).terms;
    });

    it("jumlah invoice mengikuti termin (contoh PDF: DP 9.090.900) dan satu termin hanya satu invoice", async () => {
      const dp = await tx((t) => createInvoice(t, { projectId, termId: terms[0].id, date: new Date("2026-11-18T05:00:00Z") }));
      expect(Number(dp.subtotal)).toBe(8_190_000);
      expect(Number(dp.ppn)).toBe(900_900);
      expect(Number(dp.total)).toBe(9_090_900);
      expect(dp.number).toMatch(new RegExp(`^S${tag}-\\d{3}/INV/XI/2026$`));
      expect(dp.dueDate.getTime() - dp.date.getTime()).toBe(7 * 86_400_000);
      await expect(tx((t) => createInvoice(t, { projectId, termId: terms[0].id }))).rejects.toThrow(/sudah ditagih/);
      const lunas = await tx((t) => createInvoice(t, { projectId, termId: terms[1].id, date: day }));
      expect(Number(dp.total) + Number(lunas.total)).toBe(30_303_000);
      // Nomor invoice berurutan tanpa celah.
      const seq = (n: string) => Number(n.split("/")[0].split("-")[1]);
      expect(seq(lunas.number)).toBe(seq(dp.number) + 1);
    });

    it("termin terkunci selama ada invoice terbit, bebas setelah invoice dibatalkan", async () => {
      await expect(tx((t) => setProjectTerms(t, projectId, [{ label: "Lunas", trigger: "x", percent: 100, dueDays: 14 }]))).rejects.toThrow(/invoice/);
      const inv = await db.invoice.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
      for (const i of inv) await tx((t) => voidInvoice(t, i.id, "ganti skema"));
      await tx((t) => setProjectTerms(t, projectId, [{ label: "Lunas", trigger: "net 14", percent: 100, dueDays: 14 }]));
      const plan = await tx((t) => projectTermPlan(t, projectId));
      expect(plan.terms).toHaveLength(1);
      expect(plan.terms[0].amount.total).toBe(30_303_000);
      const again = await tx((t) => createInvoice(t, { projectId, termId: plan.terms[0].id, date: day }));
      expect(Number(again.total)).toBe(30_303_000);
      await expect(tx((t) => voidInvoice(t, again.id, " "))).rejects.toThrow(/alasan/);
    });

    it("pembayaran sebagian, kelebihan bayar ditolak, kwitansi bernomor, batal mengembalikan sisa", async () => {
      const plan = await tx((t) => projectTermPlan(t, projectId));
      const inv = await db.invoice.findFirstOrThrow({ where: { projectId, status: "TERBIT" } });
      expect(plan.order.total).toBe(30_303_000);
      const p1 = await tx((t) => recordPayment(t, { invoiceId: inv.id, amount: 5_000_000, date: new Date("2026-11-24T05:00:00Z") }));
      expect(p1.receiptNumber).toMatch(new RegExp(`^S${tag}-\\d{3}/KW/XI/2026$`));
      expect(Number(p1.balanceAfter)).toBe(25_303_000);
      await expect(tx((t) => recordPayment(t, { invoiceId: inv.id, amount: 25_303_001 }))).rejects.toThrow(/melebihi/);
      await expect(tx((t) => recordPayment(t, { invoiceId: inv.id, amount: 0 }))).rejects.toThrow();
      await expect(tx((t) => voidInvoice(t, inv.id, "salah"))).rejects.toThrow(/pembayaran/);
      const p2 = await tx((t) => recordPayment(t, { invoiceId: inv.id, amount: 25_303_000, method: "TUNAI" }));
      expect(Number(p2.balanceAfter)).toBe(0);
      expect(p2.receiptNumber).not.toBe(p1.receiptNumber);
      let cur = await db.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { payments: true } });
      expect(paidOf(cur.payments)).toBe(30_303_000);
      await expect(tx((t) => recordPayment(t, { invoiceId: inv.id, amount: 1 }))).rejects.toThrow(/melebihi/);
      await tx((t) => voidPayment(t, p2.id, "salah catat"));
      await expect(tx((t) => voidPayment(t, p2.id, "lagi"))).rejects.toThrow(/sudah dibatalkan/);
      cur = await db.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { payments: true } });
      expect(paidOf(cur.payments)).toBe(5_000_000);
    });

    it("dua pembayaran bersamaan tidak boleh melebihi tagihan", async () => {
      const q = await quote(gtf);
      const full = await db.quotation.findUniqueOrThrow({ where: { id: q.id }, include: { lines: true } });
      const r = await tx((t) => convertQuotationToOrder(t, q.id, { date: day, productIds: Object.fromEntries(full.lines.map((l) => [l.id, meja])) }));
      const plan = await tx((t) => projectTermPlan(t, r.projectId));
      const inv = await tx((t) => createInvoice(t, { projectId: r.projectId, termId: plan.terms[0].id, date: day }));
      const total = Number(inv.total);
      const results = await Promise.allSettled([1, 2, 3].map(() => tx((t) => recordPayment(t, { invoiceId: inv.id, amount: total * 0.6 }))));
      expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      const cur = await db.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { payments: true } });
      expect(paidOf(cur.payments)).toBeLessThanOrEqual(total);
    });

    it("invoice butuh Konfirmasi Order", async () => {
      const proj = await tx((t) => createProject(t, { kind: "ORDER", name: `${tag} tanpa KO`, companyId: gtf, customerId: cust, lines: [{ productId: meja, qty: 1, unitPrice: 1000 }] }));
      await db.paymentTerm.create({ data: { projectId: proj.id, seq: 1, label: "Lunas", trigger: "x", percent: 100 } });
      const term = await db.paymentTerm.findFirstOrThrow({ where: { projectId: proj.id } });
      await expect(tx((t) => createInvoice(t, { projectId: proj.id, termId: term.id }))).rejects.toThrow(/Konfirmasi Order/);
    });
  });
});
