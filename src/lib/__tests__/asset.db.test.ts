import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { AssetRuleError } from "../asset";
import {
  addMaintenance, assignAsset, changeStatus, createAsset, deleteAsset, deleteMaintenance, disposeAsset, moveAsset, returnAsset, updateAsset,
} from "../assets";

// Tes integrasi: hanya berjalan bila DATABASE_URL tersedia (CI memakai service Postgres).
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("aset (database)", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const tag = `A${Date.now() % 1000000}`;
  let gtf = "", mesinCat = "", kendCat = "";
  const created: string[] = [];
  const tx = <T,>(fn: (t: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(fn as never) as Promise<T>;
  const input = (over: Partial<Parameters<typeof createAsset>[1]> = {}) => ({
    companyId: gtf, categoryId: mesinCat, name: `${tag} Mesin`, acquiredAt: "2024-01-10",
    cost: 120_000_000, salvage: 12_000_000, lifeMonths: 96, ...over,
  });
  const make = async (over = {}) => {
    const a = await tx((t) => createAsset(t, input(over)));
    created.push(a.id);
    return a;
  };

  beforeAll(async () => {
    gtf = (await db.company.upsert({ where: { code: "GTF" }, update: {}, create: { code: "GTF", name: "GTF", ppnRate: 0 } })).id;
    mesinCat = (await db.assetCategory.create({ data: { name: `${tag} Mesin`, type: "MESIN", usefulLifeMonths: 96 } })).id;
    kendCat = (await db.assetCategory.create({ data: { name: `${tag} Kendaraan`, type: "KENDARAAN", usefulLifeMonths: 48 } })).id;
  });
  afterAll(async () => {
    await db.asset.deleteMany({ where: { id: { in: created } } });
    await db.assetCategory.deleteMany({ where: { id: { in: [mesinCat, kendCat] } } });
    await db.auditLog.deleteMany({ where: { entity: "Asset", entityId: { in: created } } });
    await db.$disconnect();
  });

  it("kode otomatis per jenis dan berurutan", async () => {
    const a = await make();
    const b = await make();
    const k = await make({ categoryId: kendCat });
    expect(a.code).toMatch(/^MSN-\d{3}$/);
    expect(Number(b.code.slice(4))).toBe(Number(a.code.slice(4)) + 1);
    expect(k.code).toMatch(/^KDR-\d{3}$/);
  });

  it("menolak nilai tidak sah dan tanggal perolehan di masa depan", async () => {
    await expect(make({ salvage: 130_000_000 })).rejects.toBeInstanceOf(AssetRuleError);
    await expect(make({ acquiredAt: "2999-01-01" })).rejects.toThrow(/masa depan/);
    await expect(make({ categoryId: "tidak-ada" })).rejects.toBeInstanceOf(AssetRuleError);
  });

  it("kategori nonaktif tidak bisa dipakai", async () => {
    const c = await db.assetCategory.create({ data: { name: `${tag} Mati`, type: "PERALATAN", active: false } });
    await expect(make({ categoryId: c.id })).rejects.toThrow(/kategori/);
    await db.assetCategory.delete({ where: { id: c.id } });
  });

  it("penugasan: satu penugasan terbuka, hanya saat aktif, dan riwayat tersimpan", async () => {
    const a = await make();
    await tx((t) => assignAsset(t, a.id, { assignee: "Budi", assignedAt: "2024-02-01" }));
    await expect(tx((t) => assignAsset(t, a.id, { assignee: "Sari", assignedAt: "2024-03-01" }))).rejects.toThrow(/Budi/);
    await expect(tx((t) => returnAsset(t, a.id, "2024-01-15"))).rejects.toThrow(/sebelum tanggal penugasan/);
    await tx((t) => returnAsset(t, a.id, "2024-03-01"));
    await expect(tx((t) => assignAsset(t, a.id, { assignee: "Sari", assignedAt: "2024-02-15" }))).rejects.toThrow(/mendahului/);
    await tx((t) => changeStatus(t, a.id, "RUSAK"));
    await expect(tx((t) => assignAsset(t, a.id, { assignee: "Sari", assignedAt: "2024-04-01" }))).rejects.toThrow(/Aktif/);
    await tx((t) => changeStatus(t, a.id, "AKTIF"));
    await tx((t) => assignAsset(t, a.id, { assignee: "Sari", assignedAt: "2024-04-01" }));
    expect(await db.assetAssignment.count({ where: { assetId: a.id } })).toBe(2);
  });

  it("dua penugasan bersamaan: hanya satu yang berhasil", async () => {
    const a = await make();
    const results = await Promise.allSettled([
      tx((t) => assignAsset(t, a.id, { assignee: "A", assignedAt: "2024-02-01" })),
      tx((t) => assignAsset(t, a.id, { assignee: "B", assignedAt: "2024-02-01" })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.assetAssignment.count({ where: { assetId: a.id, returnedAt: null } })).toBe(1);
  });

  it("perawatan: validasi tanggal, biaya, jadwal berikutnya, dan penghapusan", async () => {
    const a = await make();
    await expect(tx((t) => addMaintenance(t, a.id, { type: "SERVIS", performedAt: "2023-12-31", cost: 0, description: "x" }))).rejects.toThrow(/sebelum tanggal perolehan/);
    await expect(tx((t) => addMaintenance(t, a.id, { type: "SERVIS", performedAt: "2024-05-01", cost: -1, description: "x" }))).rejects.toThrow(/Biaya/);
    await expect(tx((t) => addMaintenance(t, a.id, { type: "SERVIS", performedAt: "2024-05-01", cost: 0, description: "x", nextDueAt: "2024-05-01" }))).rejects.toThrow(/setelah/);
    const m = await tx((t) => addMaintenance(t, a.id, { type: "RUTIN", performedAt: "2024-05-01", cost: 750_000.5, description: "Ganti oli", nextDueAt: "2024-11-01" }));
    expect(Number(m.cost)).toBe(750_000.5);
    await expect(tx((t) => deleteAsset(t, a.id))).rejects.toThrow(/riwayat/);
    await tx((t) => deleteMaintenance(t, m.id));
    await tx((t) => deleteAsset(t, a.id));
    expect(await db.asset.findUnique({ where: { id: a.id } })).toBeNull();
  });

  it("pelepasan: menutup penugasan, mengunci aset, dan menolak perubahan lanjutan", async () => {
    const a = await make();
    await tx((t) => assignAsset(t, a.id, { assignee: "Budi", assignedAt: "2024-02-01" }));
    await tx((t) => addMaintenance(t, a.id, { type: "SERVIS", performedAt: "2024-06-01", cost: 1, description: "x" }));
    await expect(tx((t) => disposeAsset(t, a.id, { status: "DIJUAL", disposedAt: "2024-05-01" }))).rejects.toThrow(/terakhir/);
    const r = await tx((t) => disposeAsset(t, a.id, { status: "DIJUAL", disposedAt: "2025-01-10", value: 100_000_000 }));
    expect(r.status).toBe("DIJUAL");
    expect(Number(r.disposalValue)).toBe(100_000_000);
    expect((await db.assetAssignment.findFirstOrThrow({ where: { assetId: a.id } })).returnedAt?.toISOString().slice(0, 10)).toBe("2025-01-10");
    await expect(tx((t) => changeStatus(t, a.id, "AKTIF"))).rejects.toThrow(/dijual/);
    await expect(tx((t) => addMaintenance(t, a.id, { type: "SERVIS", performedAt: "2025-02-01", cost: 0, description: "x" }))).rejects.toThrow(/dilepas/);
    await expect(tx((t) => assignAsset(t, a.id, { assignee: "X", assignedAt: "2025-02-01" }))).rejects.toThrow(/Aktif/);
    await expect(tx((t) => moveAsset(t, a.id, "Gudang"))).rejects.toThrow(/dilepas/);
    await expect(tx((t) => disposeAsset(t, a.id, { status: "DIHAPUSKAN", disposedAt: "2025-02-01" }))).rejects.toThrow(/sudah dilepas/);
  });

  it("ubah data dan pindah lokasi tercatat; tanggal perolehan tidak boleh melewati riwayat", async () => {
    const a = await make();
    await tx((t) => moveAsset(t, a.id, "Bengkel las"));
    expect((await db.asset.findUniqueOrThrow({ where: { id: a.id } })).location).toBe("Bengkel las");
    await tx((t) => addMaintenance(t, a.id, { type: "SERVIS", performedAt: "2024-03-01", cost: 0, description: "x" }));
    await expect(tx((t) => updateAsset(t, a.id, { ...input(), acquiredAt: "2024-06-01" }))).rejects.toThrow(/sebelum tanggal perolehan yang baru/);
    const u = await tx((t) => updateAsset(t, a.id, { ...input(), name: `${tag} Baru`, cost: 130_000_000 }));
    expect(u.name).toBe(`${tag} Baru`);
    expect(Number(u.acquisitionCost)).toBe(130_000_000);
    expect(await db.auditLog.count({ where: { entity: "Asset", entityId: a.id, action: "aset.pindah" } })).toBe(1);
  });

  it("database menolak nilai sisa di atas nilai perolehan", async () => {
    await expect(db.$executeRaw`UPDATE assets SET "salvageValue" = "acquisitionCost" + 1 WHERE id = ${created[0]}`).rejects.toThrow();
  });
});
