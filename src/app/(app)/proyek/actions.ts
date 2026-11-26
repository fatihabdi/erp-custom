"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { InsufficientStockError, NotFoundError } from "@/lib/inventory";
import { StockRuleError } from "@/lib/stock";
import {
  addCost, cancelDelivery, cancelProject, createProject, deleteCost, issueMaterials, passQc, planDelivery,
  shipDelivery, updateStage,
} from "@/lib/project";
import { createModuleFor, MANUAL_STAGES, ProjectRuleError } from "@/lib/production";
import type { FormState } from "@/components/action-form";

const int = z.preprocess(
  (v) => (typeof v === "string" ? Number(v.trim()) : v),
  z.number({ error: "Jumlah tidak valid" }).int("Jumlah harus bilangan bulat"),
);
// Rupiah: terima "1.500.000" maupun "1500000".
const rupiah = z.preprocess(
  (v) => (typeof v === "string" ? Number(v.trim().replace(/\./g, "").replace(",", ".")) : v),
  z.number({ error: "Jumlah uang tidak valid" }),
);
const dateField = z.preprocess((v) => (v ? new Date(`${v}T00:00:00+07:00`) : null), z.date().nullable());

async function message(e: unknown): Promise<string> {
  if (e instanceof InsufficientStockError) {
    const items = await db.item.findMany({ where: { id: { in: e.shortages.map((s) => s.materialId) } }, select: { id: true, code: true, name: true } });
    const name = new Map(items.map((i) => [i.id, `${i.code} ${i.name}`]));
    return `${e.message} Kurang: ${e.shortages.map((s) => `${name.get(s.materialId) ?? s.materialId} (butuh ${s.needed}, ada ${s.available})`).join("; ")}.`;
  }
  if (e instanceof ProjectRuleError || e instanceof StockRuleError || e instanceof NotFoundError) return e.message;
  throw e;
}

async function audit(userId: string, action: string, entityId: string, detail?: object) {
  await db.auditLog.create({ data: { userId, action, entity: "Project", entityId, detail } });
}

const projectSchema = z.object({
  kind: z.enum(["ORDER", "STOK"]),
  name: z.string().trim().min(1, "Nama proyek wajib diisi").max(160),
  companyId: z.string().optional(),
  customerId: z.string().optional(),
  orderRef: z.string().trim().max(60).optional(),
  orderDate: dateField,
  dueDate: dateField,
  notes: z.string().trim().max(500).optional(),
  lines: z.array(z.object({ productId: z.string().min(1, "Pilih barang"), qty: int, unitPrice: rupiah.optional() })),
});

export async function createProjectAction(_: FormState, fd: FormData): Promise<FormState> {
  const kind = fd.get("kind") === "STOK" ? "STOK" : "ORDER";
  const user = await requirePermission(createModuleFor(kind), "create");
  let lines: unknown;
  try { lines = JSON.parse(String(fd.get("lines") ?? "[]")); } catch { return { error: "Data barang rusak." }; }
  const parsed = projectSchema.safeParse({
    kind, name: fd.get("name"), companyId: fd.get("companyId") || undefined, customerId: fd.get("customerId") || undefined,
    orderRef: fd.get("orderRef") || undefined, orderDate: fd.get("orderDate"), dueDate: fd.get("dueDate"),
    notes: fd.get("notes") || undefined, lines,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  // Pengguna yang dibatasi perusahaan hanya boleh membuat pesanan untuk perusahaannya.
  if (kind === "ORDER" && user.companies.length > 0 && d.companyId && !user.companies.some((c) => c.id === d.companyId)) {
    return { error: "Anda tidak punya akses ke perusahaan ini." };
  }
  let id: string;
  try {
    id = await db.$transaction(async (tx) => (await createProject(tx, { ...d, orderDate: d.orderDate ?? undefined, userId: user.id })).id);
  } catch (e) {
    return { error: await message(e) };
  }
  await audit(user.id, "proyek.create", id, { kind });
  revalidatePath("/proyek");
  redirect(`/proyek/${id}`);
}


export async function issueMaterialsAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("proyek", "edit");
  const lineId = String(fd.get("lineId"));
  const units = int.safeParse(fd.get("units"));
  if (!units.success) return { error: units.error.issues[0].message };
  try {
    await db.$transaction((tx) => issueMaterials(tx, { lineId, units: units.data, userId: user.id }));
  } catch (e) {
    return { error: await message(e) };
  }
  const line = await db.projectLine.findUnique({ where: { id: lineId }, select: { projectId: true } });
  if (line) { await audit(user.id, "proyek.bahan", line.projectId, { lineId, units: units.data }); revalidatePath(`/proyek/${line.projectId}`); }
  revalidatePath("/inventory");
  return { ok: "Bahan dikeluarkan dari stok." };
}

export async function updateStageAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("proyek", "edit");
  const parsed = z.object({
    lineId: z.string().min(1), stage: z.enum(MANUAL_STAGES), done: int,
    held: z.boolean(), holdNote: z.string().trim().max(300).optional(),
  }).safeParse({
    lineId: fd.get("lineId"), stage: fd.get("stage"), done: fd.get("done"),
    held: fd.get("held") === "on", holdNote: fd.get("holdNote") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await db.$transaction((tx) => updateStage(tx, parsed.data));
  } catch (e) {
    return { error: await message(e) };
  }
  const line = await db.projectLine.findUnique({ where: { id: parsed.data.lineId }, select: { projectId: true } });
  if (line) { await audit(user.id, "proyek.tahap", line.projectId, parsed.data); revalidatePath(`/proyek/${line.projectId}`); }
  revalidatePath("/proyek");
  return { ok: "Progres tersimpan." };
}

export async function passQcAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("proyek", "edit");
  const lineId = String(fd.get("lineId"));
  const qty = int.safeParse(fd.get("qty"));
  if (!qty.success) return { error: qty.error.issues[0].message };
  try {
    await db.$transaction((tx) => passQc(tx, { lineId, qty: qty.data, note: String(fd.get("note") ?? ""), userId: user.id }));
  } catch (e) {
    return { error: await message(e) };
  }
  const line = await db.projectLine.findUnique({ where: { id: lineId }, select: { projectId: true } });
  if (line) { await audit(user.id, "proyek.qc", line.projectId, { lineId, qty: qty.data }); revalidatePath(`/proyek/${line.projectId}`); }
  revalidatePath("/proyek");
  revalidatePath("/inventory");
  return { ok: "QC lulus dicatat, barang jadi masuk stok." };
}

export async function planDeliveryAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("proyek", "edit");
  const projectId = String(fd.get("projectId"));
  const lines: { lineId: string; qty: number }[] = [];
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("qty_") || !String(v).trim()) continue;
    const q = int.safeParse(v);
    if (!q.success) return { error: q.error.issues[0].message };
    if (q.data > 0) lines.push({ lineId: k.slice(4), qty: q.data });
  }
  const date = dateField.safeParse(fd.get("plannedDate"));
  if (!date.success) return { error: "Tanggal tidak valid" };
  try {
    await db.$transaction((tx) => planDelivery(tx, { projectId, lines, plannedDate: date.data, note: String(fd.get("note") ?? ""), userId: user.id }));
  } catch (e) {
    return { error: await message(e) };
  }
  await audit(user.id, "proyek.kirim.rencana", projectId);
  revalidatePath(`/proyek/${projectId}`);
  return { ok: "Rencana pengiriman dibuat." };
}

export async function shipDeliveryAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("proyek", "edit");
  const deliveryId = String(fd.get("deliveryId"));
  try {
    await db.$transaction((tx) => shipDelivery(tx, { deliveryId, userId: user.id }));
  } catch (e) {
    return { error: await message(e) };
  }
  const d = await db.delivery.findUnique({ where: { id: deliveryId }, select: { projectId: true } });
  if (d) { await audit(user.id, "proyek.kirim", d.projectId, { deliveryId }); revalidatePath(`/proyek/${d.projectId}`); }
  revalidatePath("/proyek");
  revalidatePath("/inventory");
  return { ok: "Pengiriman dicatat, stok barang jadi berkurang." };
}

export async function cancelDeliveryAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("proyek", "edit");
  const deliveryId = String(fd.get("deliveryId"));
  try {
    await db.$transaction((tx) => cancelDelivery(tx, deliveryId));
  } catch (e) {
    return { error: await message(e) };
  }
  const d = await db.delivery.findUnique({ where: { id: deliveryId }, select: { projectId: true } });
  if (d) { await audit(user.id, "proyek.kirim.batal", d.projectId, { deliveryId }); revalidatePath(`/proyek/${d.projectId}`); }
  return { ok: "Rencana dibatalkan." };
}

export async function addCostAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("proyek", "edit");
  const parsed = z.object({
    projectId: z.string().min(1), category: z.enum(["BAHAN", "TENAGA", "LAIN"]),
    description: z.string().trim().min(1, "Keterangan wajib diisi").max(200), amount: rupiah,
  }).safeParse({
    projectId: fd.get("projectId"), category: fd.get("category"), description: fd.get("description"), amount: fd.get("amount"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await db.$transaction((tx) => addCost(tx, { ...parsed.data, userId: user.id }));
  } catch (e) {
    return { error: await message(e) };
  }
  await audit(user.id, "proyek.biaya", parsed.data.projectId, { amount: parsed.data.amount });
  revalidatePath(`/proyek/${parsed.data.projectId}`);
  return { ok: "Biaya dicatat." };
}

export async function deleteCostAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("proyek", "edit");
  let projectId: string;
  try {
    projectId = await db.$transaction((tx) => deleteCost(tx, String(fd.get("costId"))));
  } catch (e) {
    return { error: await message(e) };
  }
  await audit(user.id, "proyek.biaya.hapus", projectId);
  revalidatePath(`/proyek/${projectId}`);
  return { ok: "Biaya dihapus." };
}

export async function cancelProjectAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("proyek", "delete");
  const projectId = String(fd.get("projectId"));
  try {
    await db.$transaction((tx) => cancelProject(tx, projectId));
  } catch (e) {
    return { error: await message(e) };
  }
  await audit(user.id, "proyek.batal", projectId);
  revalidatePath("/proyek");
  redirect("/proyek");
}

