"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { assetScope, canUseCompany } from "@/lib/asset-scope";
import { ASSET_TYPES, AssetRuleError } from "@/lib/asset";
import {
  addMaintenance, assignAsset, changeStatus, createAsset, deleteAsset, deleteMaintenance, disposeAsset, moveAsset, returnAsset, updateAsset,
} from "@/lib/assets";

export type FormState = { error?: string; ok?: string } | undefined;

const numField = z.preprocess(
  (v) => (typeof v === "string" ? Number(v.trim().replace(/\./g, "").replace(",", ".") || "NaN") : v),
  z.number({ error: "Angka tidak valid" }),
);
const text = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

function message(e: unknown): string {
  if (e instanceof AssetRuleError) return e.message;
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return "Data yang sama sudah ada.";
    if (e.code === "P2003") return "Data masih dipakai, tidak bisa dihapus.";
  }
  throw e;
}

/** Aset yang boleh diakses pengguna (sesuai pembatasan perusahaan), atau galat. */
async function guard(user: Awaited<ReturnType<typeof requirePermission>>, assetId: string) {
  const a = await db.asset.findFirst({ where: { id: assetId, ...assetScope(user) }, select: { id: true } });
  if (!a) throw new AssetRuleError("Aset tidak ditemukan.");
}

const assetSchema = z.object({
  name: z.string().trim().min(1, "Nama aset wajib diisi").max(120),
  brand: text(120),
  serialNumber: text(80),
  location: text(120),
  acquiredAt: z.string().min(1, "Tanggal perolehan wajib diisi"),
  cost: numField,
  salvage: numField,
  lifeMonths: numField,
  notes: text(500),
});
const fields = (fd: FormData) => ({
  name: fd.get("name"), brand: fd.get("brand") || undefined, serialNumber: fd.get("serialNumber") || undefined,
  location: fd.get("location") || undefined, acquiredAt: fd.get("acquiredAt"),
  cost: fd.get("cost") || "0", salvage: fd.get("salvage") || "0", lifeMonths: fd.get("lifeMonths") || "0",
  notes: fd.get("notes") || undefined,
});

export async function createAssetAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("aset", "create");
  const parsed = assetSchema.extend({ companyId: z.string().min(1, "Pilih perusahaan"), categoryId: z.string().min(1, "Pilih kategori") })
    .safeParse({ ...fields(fd), companyId: fd.get("companyId"), categoryId: fd.get("categoryId") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!canUseCompany(user, parsed.data.companyId)) return { error: "Anda tidak punya akses ke perusahaan ini." };
  let id: string;
  try {
    id = (await db.$transaction((tx) => createAsset(tx, parsed.data, user.id))).id;
  } catch (e) { return { error: message(e) }; }
  revalidatePath("/aset");
  redirect(`/aset/${id}`);
}

export async function updateAssetAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("aset", "edit");
  const id = String(fd.get("id"));
  const parsed = assetSchema.safeParse(fields(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await guard(user, id);
    await db.$transaction((tx) => updateAsset(tx, id, parsed.data, user.id));
  } catch (e) { return { error: message(e) }; }
  revalidatePath("/aset");
  revalidatePath(`/aset/${id}`);
  return { ok: "Tersimpan." };
}

export async function changeStatusAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("aset", "edit");
  const id = String(fd.get("id"));
  const to = z.enum(["AKTIF", "PERAWATAN", "RUSAK"]).safeParse(fd.get("status"));
  if (!to.success) return { error: "Pilih status." };
  try {
    await guard(user, id);
    await db.$transaction((tx) => changeStatus(tx, id, to.data, user.id));
  } catch (e) { return { error: message(e) }; }
  revalidatePath("/aset");
  revalidatePath(`/aset/${id}`);
  return { ok: "Status diperbarui." };
}

export async function moveAssetAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("aset", "edit");
  const id = String(fd.get("id"));
  const location = String(fd.get("location") ?? "").trim().slice(0, 120);
  try {
    await guard(user, id);
    await db.$transaction((tx) => moveAsset(tx, id, location, user.id));
  } catch (e) { return { error: message(e) }; }
  revalidatePath(`/aset/${id}`);
  return { ok: "Lokasi diperbarui." };
}

const maintSchema = z.object({
  type: z.enum(["RUTIN", "SERVIS", "PERBAIKAN"]),
  performedAt: z.string().min(1, "Tanggal wajib diisi"),
  cost: numField.refine((n) => n >= 0, "Biaya tidak boleh negatif"),
  vendor: text(120),
  description: z.string().trim().min(1, "Uraian wajib diisi").max(500),
  nextDueAt: text(10),
});

export async function addMaintenanceAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("aset", "edit");
  const id = String(fd.get("id"));
  const parsed = maintSchema.safeParse({
    type: fd.get("type"), performedAt: fd.get("performedAt"), cost: fd.get("cost") || "0",
    vendor: fd.get("vendor") || undefined, description: fd.get("description"), nextDueAt: fd.get("nextDueAt") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await guard(user, id);
    await db.$transaction((tx) => addMaintenance(tx, id, parsed.data, user.id));
  } catch (e) { return { error: message(e) }; }
  revalidatePath("/aset");
  revalidatePath(`/aset/${id}`);
  return { ok: "Perawatan dicatat." };
}

export async function deleteMaintenanceAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("aset", "delete");
  const id = String(fd.get("id"));
  const maintId = String(fd.get("maintenanceId"));
  try {
    await guard(user, id);
    const rec = await db.assetMaintenance.findFirst({ where: { id: maintId, assetId: id }, select: { id: true } });
    if (!rec) return { error: "Catatan tidak ditemukan." };
    await db.$transaction((tx) => deleteMaintenance(tx, maintId, user.id));
  } catch (e) { return { error: message(e) }; }
  revalidatePath("/aset");
  revalidatePath(`/aset/${id}`);
  return { ok: "Catatan dihapus." };
}

export async function assignAssetAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("aset", "edit");
  const id = String(fd.get("id"));
  const parsed = z.object({
    assignee: z.string().trim().min(1, "Nama penanggung jawab wajib diisi").max(120),
    assignedAt: z.string().min(1, "Tanggal wajib diisi"),
    note: text(300),
  }).safeParse({ assignee: fd.get("assignee"), assignedAt: fd.get("assignedAt"), note: fd.get("note") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await guard(user, id);
    await db.$transaction((tx) => assignAsset(tx, id, parsed.data, user.id));
  } catch (e) { return { error: message(e) }; }
  revalidatePath("/aset");
  revalidatePath(`/aset/${id}`);
  return { ok: "Penugasan dicatat." };
}

export async function returnAssetAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("aset", "edit");
  const id = String(fd.get("id"));
  try {
    await guard(user, id);
    await db.$transaction((tx) => returnAsset(tx, id, String(fd.get("returnedAt") ?? ""), user.id));
  } catch (e) { return { error: message(e) }; }
  revalidatePath("/aset");
  revalidatePath(`/aset/${id}`);
  return { ok: "Aset dikembalikan." };
}

export async function disposeAssetAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("aset", "approve");
  const id = String(fd.get("id"));
  const parsed = z.object({
    status: z.enum(["DIJUAL", "DIHAPUSKAN"]),
    disposedAt: z.string().min(1, "Tanggal wajib diisi"),
    value: z.preprocess((v) => (v === "" || v == null ? undefined : v), numField.optional()),
    note: text(300),
  }).safeParse({ status: fd.get("status"), disposedAt: fd.get("disposedAt"), value: fd.get("value") ?? undefined, note: fd.get("note") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await guard(user, id);
    await db.$transaction((tx) => disposeAsset(tx, id, parsed.data, user.id));
  } catch (e) { return { error: message(e) }; }
  revalidatePath("/aset");
  revalidatePath(`/aset/${id}`);
  return { ok: "Aset dilepas." };
}

export async function deleteAssetAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("aset", "delete");
  const id = String(fd.get("id"));
  try {
    await guard(user, id);
    await db.$transaction((tx) => deleteAsset(tx, id, user.id));
  } catch (e) { return { error: message(e) }; }
  revalidatePath("/aset");
  redirect("/aset");
}

const categorySchema = z.object({
  name: z.string().trim().min(1, "Nama kategori wajib diisi").max(80),
  type: z.enum(ASSET_TYPES as [string, ...string[]]),
  usefulLifeMonths: numField.refine((n) => Number.isInteger(n) && n >= 0 && n <= 1200, "Umur manfaat harus bilangan bulat 0–1200 bulan"),
});

export async function createCategoryAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("aset", "create");
  const parsed = categorySchema.safeParse({ name: fd.get("name"), type: fd.get("type"), usefulLifeMonths: fd.get("usefulLifeMonths") || "0" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const c = await db.assetCategory.create({ data: { ...parsed.data, type: parsed.data.type as never } });
    await db.auditLog.create({ data: { userId: user.id, action: "aset.kategori.create", entity: "AssetCategory", entityId: c.id } });
  } catch (e) { return { error: message(e) }; }
  revalidatePath("/aset/kategori");
  return { ok: "Kategori ditambahkan." };
}

export async function updateCategoryAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("aset", "edit");
  const id = String(fd.get("id"));
  const parsed = categorySchema.omit({ type: true }).safeParse({ name: fd.get("name"), usefulLifeMonths: fd.get("usefulLifeMonths") || "0" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await db.assetCategory.update({ where: { id }, data: { ...parsed.data, active: fd.get("active") === "on" } });
    await db.auditLog.create({ data: { userId: user.id, action: "aset.kategori.update", entity: "AssetCategory", entityId: id } });
  } catch (e) { return { error: message(e) }; }
  revalidatePath("/aset/kategori");
  return { ok: "Tersimpan." };
}
