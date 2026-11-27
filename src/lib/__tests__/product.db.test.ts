import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_TERMS } from "../billing";
import { convertQuotationToOrder, createQuotation } from "../documents";
import { applyMovement, InsufficientStockError, setBom } from "../inventory";
import { createProduct, NEW_PRODUCT, ProductRuleError, updateProduct, type ProductInput } from "../product";
import { createProject, passQc, planDelivery, shipDelivery } from "../project";
import { ProjectRuleError } from "../production";

// Tes integrasi: hanya berjalan bila DATABASE_URL tersedia (CI memakai service Postgres).
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("master produk (database)", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const tag = `M${Date.now() % 1000000}`;
  const tx = <T,>(fn: (t: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(fn as never) as Promise<T>;
  const base: ProductInput = { name: `${tag} Meja`, category: "SEKOLAH", type: "PRODUKSI", unit: "unit", price: 1_500_000, cost: 900_000 };
  const productIds: string[] = [];
  let bahan = "", cust = "", sba = "";
  const make = async (over: Partial<ProductInput> = {}) => {
    const r = await tx((t) => createProduct(t, { ...base, ...over }));
    productIds.push(r.product.id);
    return r;
  };

  beforeAll(async () => {
    bahan = (await db.item.create({ data: { kind: "RAW", code: `${tag}-KAYU`, name: "Kayu", unit: "lembar" } })).id;
    cust = (await db.customer.create({ data: { name: `${tag} Pelanggan` } })).id;
    sba = (await db.company.create({ data: { code: `S${tag}`, name: "SBA tes", ppnRate: 11 } })).id;
  });
  afterAll(async () => {
    const items = (await db.item.findMany({ where: { productId: { in: productIds } }, select: { id: true } })).map((i) => i.id);
    await db.salesOrder.deleteMany({ where: { companyId: sba } });
    await db.quotation.deleteMany({ where: { companyId: sba } });
    await db.paymentTerm.deleteMany({ where: { project: { companyId: sba } } });
    const mine = { OR: [{ companyId: sba }, { name: { startsWith: tag } }] };
    await db.deliveryLine.deleteMany({ where: { delivery: { project: mine } } });
    await db.project.deleteMany({ where: mine });
    await db.productionOrder.deleteMany({ where: { companyId: sba } });
    await db.stockMovement.deleteMany({ where: { itemId: { in: [...items, bahan] } } });
    await db.projectLine.deleteMany({ where: { productId: { in: items } } });
    await db.quotationLine.deleteMany({ where: { productId: { in: items } } });
    await db.bomLine.deleteMany({ where: { OR: [{ productId: { in: items } }, { materialId: bahan }] } });
    await db.item.deleteMany({ where: { id: { in: [...items, bahan] } } });
    // Produk dari KO (item custom) ikut dibersihkan lewat nama.
    await db.product.deleteMany({ where: { OR: [{ id: { in: productIds } }, { name: { startsWith: tag } }] } });
    await db.customer.delete({ where: { id: cust } });
    await db.company.delete({ where: { id: sba } });
    await db.$disconnect();
  });

  it("membuat produk sekaligus barang jadi bersaldo 0 dengan kode yang sama; kode berurutan", async () => {
    const a = await make();
    const b = await make({ name: `${tag} Kursi` });
    const item = await db.item.findUniqueOrThrow({ where: { id: a.itemId } });
    expect(item).toMatchObject({ kind: "FINISHED", code: a.product.code, name: `${tag} Meja`, productId: a.product.id, active: true });
    expect(Number(item.onHand)).toBe(0);
    expect(a.product.code).toMatch(/^PRD-\d{3,}$/);
    expect(Number(b.product.code.slice(4))).toBe(Number(a.product.code.slice(4)) + 1);
    expect(Number(a.product.price)).toBe(1_500_000);
    expect(Number(a.product.cost)).toBe(900_000);
  });

  it("mengubah produk menyalin nama, satuan, dan status aktif ke barang tanpa mengubah stok", async () => {
    const a = await make();
    await tx((t) => applyMovement(t, { itemId: a.itemId, type: "MASUK", qty: 5 }));
    await tx((t) => updateProduct(t, a.product.id, { ...base, name: `${tag} Meja baru`, unit: "set", price: 2_000_000, active: false }));
    const item = await db.item.findUniqueOrThrow({ where: { id: a.itemId } });
    expect(item).toMatchObject({ name: `${tag} Meja baru`, unit: "set", active: false });
    expect(Number(item.onHand)).toBe(5);
    expect(Number((await db.product.findUniqueOrThrow({ where: { id: a.product.id } })).price)).toBe(2_000_000);
    // Produk nonaktif tidak bisa lagi dipakai di proyek.
    await expect(tx((t) => createProject(t, {
      kind: "ORDER", name: `${tag} x`, companyId: sba, customerId: cust, lines: [{ productId: a.itemId, qty: 1, unitPrice: 1 }],
    }))).rejects.toThrow(ProjectRuleError);
  });

  it("produk dagang tidak boleh punya BOM, dan produk ber-BOM tidak bisa dijadikan dagang", async () => {
    const dagang = await make({ type: "DAGANG" });
    await expect(tx((t) => setBom(t, dagang.itemId, [{ materialId: bahan, qty: 1 }]))).rejects.toThrow("tidak memakai BOM");
    const prod = await make();
    await tx((t) => setBom(t, prod.itemId, [{ materialId: bahan, qty: 1 }]));
    await expect(tx((t) => updateProduct(t, prod.product.id, { ...base, type: "DAGANG" }))).rejects.toThrow(ProductRuleError);
    await tx((t) => setBom(t, prod.itemId, []));
    await expect(tx((t) => updateProduct(t, prod.product.id, { ...base, type: "DAGANG" }))).resolves.toBeTruthy();
  });

  it("produk dagang: tahap produksi langsung selesai, tidak bisa QC, dikirim dari stok yang ada", async () => {
    const d = await make({ name: `${tag} Papan tulis`, type: "DAGANG" });
    const p = await tx((t) => createProject(t, {
      kind: "ORDER", name: `${tag} dagang`, companyId: sba, customerId: cust, lines: [{ productId: d.itemId, qty: 3, unitPrice: 700_000 }],
    }));
    const line = await db.projectLine.findFirstOrThrow({ where: { projectId: p.id }, include: { stages: true } });
    expect(line.issuedUnits).toBe(3);
    const done = Object.fromEntries(line.stages.map((s) => [s.stage, s.done]));
    expect(done).toMatchObject({ RANGKA_BESI: 3, POTONG_KAYU: 3, RAKIT: 3, FINISHING: 3, QC: 3, PACKING: 3, KIRIM: 0 });
    // Tidak ada QC lulus yang menambah stok.
    await expect(tx((t) => passQc(t, { lineId: line.id, qty: 1 }))).rejects.toThrow(ProjectRuleError);
    const del = await tx((t) => planDelivery(t, { projectId: p.id, lines: [{ lineId: line.id, qty: 3 }] }));
    // Stok belum ada: pengiriman gagal, baru berhasil setelah pembelian dicatat sebagai stok masuk.
    await expect(tx((t) => shipDelivery(t, { deliveryId: del.id }))).rejects.toThrow(InsufficientStockError);
    await tx((t) => applyMovement(t, { itemId: d.itemId, type: "MASUK", qty: 3, note: "Beli dari pemasok" }));
    await tx((t) => shipDelivery(t, { deliveryId: del.id }));
    expect(Number((await db.item.findUniqueOrThrow({ where: { id: d.itemId } })).onHand)).toBe(0);
    expect((await db.project.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("SELESAI");
  });

  it("produksi stok menolak produk dagang", async () => {
    const d = await make({ type: "DAGANG" });
    await expect(tx((t) => createProject(t, { kind: "STOK", name: `${tag} stok`, lines: [{ productId: d.itemId, qty: 1 }] }))).rejects.toThrow("produk dagang");
  });

  it("penawaran → KO: item custom jadi produk baru, produk katalog membawa spesifikasi dan gambar ke SO, harga baris tetap harga penawaran", async () => {
    const cat = await make({ name: `${tag} Lemari`, size: "90 x 40 x 180 cm", material: "Kayu jati", spec: "Pintu geser", price: 2_500_000 });
    await db.productImage.create({ data: { productId: cat.product.id, data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]), mime: "image/png" } });
    const q = await tx((t) => createQuotation(t, {
      companyId: sba, customerId: cust, subject: "Campuran", terms: DEFAULT_TERMS,
      lines: [
        // Harga di penawaran berbeda dari harga katalog (negosiasi): yang dipakai adalah harga di baris.
        { description: "Lemari", qty: 2, unit: "unit", unitPrice: 2_300_000, productId: cat.itemId },
        { description: `${tag} Panggung custom`, spec: "Ukuran 4 x 2 m", qty: 1, unit: "paket", unitPrice: 9_000_000 },
      ],
    }));
    const customLine = await db.quotationLine.findFirstOrThrow({ where: { quotationId: q.id, productId: null } });
    const { projectId } = await tx((t) => convertQuotationToOrder(t, q.id, { productIds: { [customLine.id]: NEW_PRODUCT } }));
    const lines = await db.projectLine.findMany({ where: { projectId }, orderBy: { sort: "asc" }, include: { product: { include: { product: true } } } });
    expect(lines.map((l) => Number(l.unitPrice))).toEqual([2_300_000, 9_000_000]);
    expect(Number(lines[0].product.product!.price)).toBe(2_500_000); // harga master tidak berubah
    const created = lines[1].product.product!;
    expect(created).toMatchObject({ name: `${tag} Panggung custom`, type: "PRODUKSI", category: "LAINNYA", unit: "paket", spec: "Ukuran 4 x 2 m" });
    expect(Number(created.price)).toBe(9_000_000);
    expect(lines[1].product.productId).toBe(created.id);
    productIds.push(created.id);
    // Penawaran menyimpan keterkaitan ke produk baru.
    expect((await db.quotationLine.findMany({ where: { quotationId: q.id }, orderBy: { sort: "asc" } })).every((l) => l.productId)).toBe(true);
    // SO: baris katalog tanpa spesifikasi penawaran memakai spesifikasi produk, dan gambar produk ikut.
    const so = await db.productionOrder.findUniqueOrThrow({ where: { projectId }, include: { lines: { orderBy: { sort: "asc" }, include: { image: true } } } });
    expect(so.lines[0].spec).toBe("Ukuran 90 x 40 x 180 cm\nBahan Kayu jati\nPintu geser");
    expect(so.lines[0].image?.mime).toBe("image/png");
    expect(so.lines[1].spec).toBe("Ukuran 4 x 2 m");
    expect(so.lines[1].image).toBeNull();
  });
});
