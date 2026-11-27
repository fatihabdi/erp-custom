import type { Prisma } from "@/generated/prisma/client";
import {
  AssetRuleError, TYPE_PREFIX, checkAssignable, checkEventDate, checkStatusChange, isTerminal, parseDay, validateAssetValues,
  wibDay, type AssetStatusName, type AssetTypeName, type MaintenanceTypeName,
} from "@/lib/asset";

type Tx = Prisma.TransactionClient;

async function lock(tx: Tx, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
/** Semua perubahan satu aset dikunci per aset, supaya permintaan bersamaan tidak saling menimpa. */
async function loadLocked(tx: Tx, assetId: string) {
  await lock(tx, `asset:${assetId}`);
  const a = await tx.asset.findUnique({ where: { id: assetId } });
  if (!a) throw new AssetRuleError("Aset tidak ditemukan.");
  return a;
}
const money = (n: number) => Math.round(n * 100) / 100;

export async function nextAssetCode(tx: Tx, type: AssetTypeName): Promise<string> {
  const prefix = TYPE_PREFIX[type];
  await lock(tx, `asset-code:${prefix}`);
  const rows = await tx.asset.findMany({ where: { code: { startsWith: `${prefix}-` } }, select: { code: true } });
  const max = rows.reduce((m, r) => Math.max(m, parseInt(r.code.slice(prefix.length + 1), 10) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

export type AssetInput = {
  companyId: string; categoryId: string; name: string; brand?: string | null; serialNumber?: string | null;
  location?: string | null; acquiredAt: string; cost: number; salvage: number; lifeMonths: number; notes?: string | null;
};

function checkAcquired(s: string): Date {
  const d = parseDay(s);
  if (!d) throw new AssetRuleError("Tanggal perolehan tidak valid.");
  if (d > wibDay()) throw new AssetRuleError("Tanggal perolehan tidak boleh di masa depan.");
  return d;
}

export async function createAsset(tx: Tx, input: AssetInput, userId?: string | null) {
  validateAssetValues(input);
  const acquiredAt = checkAcquired(input.acquiredAt);
  const category = await tx.assetCategory.findUnique({ where: { id: input.categoryId } });
  if (!category || !category.active) throw new AssetRuleError("Pilih kategori aset yang aktif.");
  const company = await tx.company.findUnique({ where: { id: input.companyId } });
  if (!company || !company.active) throw new AssetRuleError("Pilih perusahaan pemilik aset.");
  const code = await nextAssetCode(tx, category.type);
  const asset = await tx.asset.create({
    data: {
      code, companyId: input.companyId, categoryId: input.categoryId, name: input.name,
      brand: input.brand || null, serialNumber: input.serialNumber || null, location: input.location || null,
      acquiredAt, acquisitionCost: money(input.cost), salvageValue: money(input.salvage),
      usefulLifeMonths: input.lifeMonths, notes: input.notes || null,
    },
  });
  await tx.auditLog.create({ data: { userId, action: "aset.create", entity: "Asset", entityId: asset.id, detail: { code } } });
  return asset;
}

/** Ubah data aset. Perusahaan dan kategori tetap; nilai tidak berubah setelah aset dilepas. */
export async function updateAsset(tx: Tx, assetId: string, input: Omit<AssetInput, "companyId" | "categoryId">, userId?: string | null) {
  const a = await loadLocked(tx, assetId);
  if (isTerminal(a.status as AssetStatusName)) throw new AssetRuleError("Aset yang sudah dilepas tidak bisa diubah.");
  validateAssetValues(input);
  const acquiredAt = checkAcquired(input.acquiredAt);
  if (acquiredAt.getTime() !== a.acquiredAt.getTime()) {
    const [m, s] = await Promise.all([
      tx.assetMaintenance.count({ where: { assetId, performedAt: { lt: acquiredAt } } }),
      tx.assetAssignment.count({ where: { assetId, assignedAt: { lt: acquiredAt } } }),
    ]);
    if (m + s > 0) throw new AssetRuleError("Ada perawatan atau penugasan sebelum tanggal perolehan yang baru.");
  }
  const updated = await tx.asset.update({
    where: { id: assetId },
    data: {
      name: input.name, brand: input.brand || null, serialNumber: input.serialNumber || null, location: input.location || null,
      acquiredAt, acquisitionCost: money(input.cost), salvageValue: money(input.salvage),
      usefulLifeMonths: input.lifeMonths, notes: input.notes || null,
    },
  });
  await tx.auditLog.create({ data: { userId, action: "aset.update", entity: "Asset", entityId: assetId } });
  return updated;
}

export async function changeStatus(tx: Tx, assetId: string, to: AssetStatusName, userId?: string | null) {
  const a = await loadLocked(tx, assetId);
  checkStatusChange(a.status as AssetStatusName, to);
  if (a.status === to) return a;
  const updated = await tx.asset.update({ where: { id: assetId }, data: { status: to } });
  await tx.auditLog.create({ data: { userId, action: "aset.status", entity: "Asset", entityId: assetId, detail: { from: a.status, to } } });
  return updated;
}

export async function moveAsset(tx: Tx, assetId: string, location: string, userId?: string | null) {
  const a = await loadLocked(tx, assetId);
  if (isTerminal(a.status as AssetStatusName)) throw new AssetRuleError("Aset yang sudah dilepas tidak bisa dipindah.");
  const updated = await tx.asset.update({ where: { id: assetId }, data: { location: location || null } });
  await tx.auditLog.create({ data: { userId, action: "aset.pindah", entity: "Asset", entityId: assetId, detail: { from: a.location, to: location || null } } });
  return updated;
}

export type MaintenanceInput = {
  type: MaintenanceTypeName; performedAt: string; cost: number; vendor?: string | null; description: string; nextDueAt?: string | null;
};

export async function addMaintenance(tx: Tx, assetId: string, input: MaintenanceInput, userId?: string | null) {
  const a = await loadLocked(tx, assetId);
  if (isTerminal(a.status as AssetStatusName)) throw new AssetRuleError("Aset yang sudah dilepas tidak bisa dirawat.");
  const performedAt = parseDay(input.performedAt);
  if (!performedAt) throw new AssetRuleError("Tanggal perawatan tidak valid.");
  checkEventDate(performedAt, a.acquiredAt, "Tanggal perawatan");
  if (!Number.isFinite(input.cost) || input.cost < 0) throw new AssetRuleError("Biaya tidak boleh negatif.");
  let nextDueAt: Date | null = null;
  if (input.nextDueAt) {
    nextDueAt = parseDay(input.nextDueAt);
    if (!nextDueAt) throw new AssetRuleError("Jadwal berikutnya tidak valid.");
    if (nextDueAt <= performedAt) throw new AssetRuleError("Jadwal berikutnya harus setelah tanggal perawatan.");
  }
  const rec = await tx.assetMaintenance.create({
    data: {
      assetId, type: input.type, performedAt, cost: money(input.cost), vendor: input.vendor || null,
      description: input.description, nextDueAt, userId,
    },
  });
  await tx.auditLog.create({ data: { userId, action: "aset.perawatan", entity: "Asset", entityId: assetId, detail: { maintenanceId: rec.id, cost: input.cost } } });
  return rec;
}

export async function deleteMaintenance(tx: Tx, maintenanceId: string, userId?: string | null) {
  const rec = await tx.assetMaintenance.findUnique({ where: { id: maintenanceId } });
  if (!rec) throw new AssetRuleError("Catatan perawatan tidak ditemukan.");
  await loadLocked(tx, rec.assetId);
  await tx.assetMaintenance.delete({ where: { id: maintenanceId } });
  await tx.auditLog.create({ data: { userId, action: "aset.perawatan.hapus", entity: "Asset", entityId: rec.assetId, detail: { maintenanceId, cost: Number(rec.cost) } } });
}

export async function assignAsset(tx: Tx, assetId: string, input: { assignee: string; assignedAt: string; note?: string | null }, userId?: string | null) {
  const a = await loadLocked(tx, assetId);
  checkAssignable(a.status as AssetStatusName);
  const assignedAt = parseDay(input.assignedAt);
  if (!assignedAt) throw new AssetRuleError("Tanggal penugasan tidak valid.");
  checkEventDate(assignedAt, a.acquiredAt, "Tanggal penugasan");
  const open = await tx.assetAssignment.findFirst({ where: { assetId, returnedAt: null } });
  if (open) throw new AssetRuleError(`Aset masih ditugaskan ke ${open.assignee}. Kembalikan dulu sebelum menugaskan ulang.`);
  const last = await tx.assetAssignment.findFirst({ where: { assetId }, orderBy: { returnedAt: "desc" } });
  if (last?.returnedAt && assignedAt < last.returnedAt) throw new AssetRuleError("Penugasan baru tidak boleh mendahului pengembalian sebelumnya.");
  const rec = await tx.assetAssignment.create({ data: { assetId, assignee: input.assignee, assignedAt, note: input.note || null, userId } });
  await tx.auditLog.create({ data: { userId, action: "aset.tugas", entity: "Asset", entityId: assetId, detail: { assignee: input.assignee } } });
  return rec;
}

export async function returnAsset(tx: Tx, assetId: string, returnedAtStr: string, userId?: string | null) {
  const a = await loadLocked(tx, assetId);
  const open = await tx.assetAssignment.findFirst({ where: { assetId, returnedAt: null } });
  if (!open) throw new AssetRuleError("Aset tidak sedang ditugaskan.");
  const returnedAt = parseDay(returnedAtStr);
  if (!returnedAt) throw new AssetRuleError("Tanggal pengembalian tidak valid.");
  checkEventDate(returnedAt, a.acquiredAt, "Tanggal pengembalian");
  if (returnedAt < open.assignedAt) throw new AssetRuleError("Pengembalian tidak boleh sebelum tanggal penugasan.");
  const rec = await tx.assetAssignment.update({ where: { id: open.id }, data: { returnedAt } });
  await tx.auditLog.create({ data: { userId, action: "aset.kembali", entity: "Asset", entityId: assetId, detail: { assignee: open.assignee } } });
  return rec;
}

/** Melepas aset (dijual atau dihapuskan). Penugasan yang masih terbuka ditutup pada tanggal pelepasan. */
export async function disposeAsset(
  tx: Tx, assetId: string, input: { status: "DIJUAL" | "DIHAPUSKAN"; disposedAt: string; value?: number | null; note?: string | null }, userId?: string | null,
) {
  const a = await loadLocked(tx, assetId);
  if (isTerminal(a.status as AssetStatusName)) throw new AssetRuleError("Aset sudah dilepas.");
  const disposedAt = parseDay(input.disposedAt);
  if (!disposedAt) throw new AssetRuleError("Tanggal pelepasan tidak valid.");
  checkEventDate(disposedAt, a.acquiredAt, "Tanggal pelepasan");
  const [lastM, lastA] = await Promise.all([
    tx.assetMaintenance.findFirst({ where: { assetId }, orderBy: { performedAt: "desc" } }),
    tx.assetAssignment.findFirst({ where: { assetId }, orderBy: { assignedAt: "desc" } }),
  ]);
  if ((lastM && disposedAt < lastM.performedAt) || (lastA && disposedAt < lastA.assignedAt)) {
    throw new AssetRuleError("Tanggal pelepasan tidak boleh sebelum perawatan atau penugasan terakhir.");
  }
  const value = input.status === "DIJUAL" ? (input.value ?? 0) : null;
  if (value !== null && (!Number.isFinite(value) || value < 0)) throw new AssetRuleError("Nilai penjualan tidak boleh negatif.");
  await tx.assetAssignment.updateMany({ where: { assetId, returnedAt: null }, data: { returnedAt: disposedAt } });
  const notes = input.note ? [a.notes, input.note].filter(Boolean).join("\n") : a.notes;
  const updated = await tx.asset.update({
    where: { id: assetId },
    data: { status: input.status, disposedAt, disposalValue: value === null ? null : money(value), notes },
  });
  await tx.auditLog.create({ data: { userId, action: "aset.lepas", entity: "Asset", entityId: assetId, detail: { status: input.status, value } } });
  return updated;
}

/** Hapus aset yang salah input; hanya bila belum punya riwayat perawatan atau penugasan. */
export async function deleteAsset(tx: Tx, assetId: string, userId?: string | null) {
  const a = await loadLocked(tx, assetId);
  const [m, s] = await Promise.all([tx.assetMaintenance.count({ where: { assetId } }), tx.assetAssignment.count({ where: { assetId } })]);
  if (m + s > 0) throw new AssetRuleError("Aset yang sudah punya riwayat tidak bisa dihapus. Gunakan “Lepas aset”.");
  await tx.asset.delete({ where: { id: assetId } });
  await tx.auditLog.create({ data: { userId, action: "aset.hapus", entity: "Asset", entityId: assetId, detail: { code: a.code } } });
}
