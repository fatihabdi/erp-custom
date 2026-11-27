"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { canUpdateStage } from "@/lib/permissions";
import { DocumentRuleError } from "@/lib/billing";
import { NotFoundError } from "@/lib/inventory";
import { updateStage } from "@/lib/project";
import { MANUAL_STAGES, ProjectRuleError } from "@/lib/production";
import { checkSoImage, updateProductionOrder } from "@/lib/sales-order";
import type { FormState } from "@/components/action-form";

type User = Awaited<ReturnType<typeof requirePermission>>;
const inScope = (u: User, companyId: string) => u.companies.length === 0 || u.companies.some((c) => c.id === companyId);

async function audit(userId: string, action: string, entityId: string, detail?: object) {
  await db.auditLog.create({ data: { userId, action, entity: "ProductionOrder", entityId, detail } });
}

function message(e: unknown): string {
  if (e instanceof DocumentRuleError || e instanceof ProjectRuleError || e instanceof NotFoundError) return e.message;
  throw e;
}

export async function updateSoAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("sales-order", "edit");
  const ids = fd.getAll("lineId").map(String);
  const titles = fd.getAll("title").map(String);
  const specs = fd.getAll("spec").map(String);
  const id = String(fd.get("id") ?? "");
  const so = await db.productionOrder.findUnique({ where: { id }, select: { companyId: true, projectId: true } });
  if (!so || !inScope(user, so.companyId)) return { error: "Sales Order tidak ditemukan." };
  try {
    await db.$transaction((tx) => updateProductionOrder(tx, id, {
      notes: String(fd.get("notes") ?? ""),
      lines: ids.map((lineId, i) => ({ id: lineId, title: titles[i] ?? "", spec: specs[i] ?? "" })),
    }));
  } catch (e) {
    return { error: message(e) };
  }
  await audit(user.id, "so.ubah", id);
  revalidatePath(`/sales-order/${id}`);
  return { ok: "Sales Order tersimpan." };
}

async function lineOf(user: User, lineId: string) {
  const line = await db.productionOrderLine.findUnique({ where: { id: lineId }, include: { order: { select: { id: true, companyId: true } } } });
  return line && inScope(user, line.order.companyId) ? line : null;
}

export async function uploadSoImageAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("sales-order", "edit");
  const line = await lineOf(user, String(fd.get("lineId") ?? ""));
  if (!line) return { error: "Barang tidak ditemukan." };
  const file = fd.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Pilih berkas gambar." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkSoImage(bytes);
  if (!check.ok) return { error: check.error };
  const data = Buffer.from(bytes);
  await db.productionOrderImage.upsert({ where: { lineId: line.id }, create: { lineId: line.id, data, mime: check.mime }, update: { data, mime: check.mime } });
  await audit(user.id, "so.gambar", line.order.id, { lineId: line.id });
  revalidatePath(`/sales-order/${line.order.id}`);
  return { ok: "Gambar tersimpan." };
}

export async function removeSoImageAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("sales-order", "edit");
  const line = await lineOf(user, String(fd.get("lineId") ?? ""));
  if (!line) return { error: "Barang tidak ditemukan." };
  await db.productionOrderImage.deleteMany({ where: { lineId: line.id } });
  await audit(user.id, "so.gambar.hapus", line.order.id, { lineId: line.id });
  revalidatePath(`/sales-order/${line.order.id}`);
  return { ok: "Gambar dihapus." };
}

const int = z.preprocess(
  (v) => (typeof v === "string" ? Number(v.trim()) : v),
  z.number({ error: "Jumlah tidak valid" }).int("Jumlah harus bilangan bulat"),
);

/** Perbarui progres satu tahap dari halaman SO. Ketua produksi hanya boleh tahapnya sendiri (lihat canUpdateStage). */
export async function updateSoStageAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("sales-order", "view");
  const parsed = z.object({
    lineId: z.string().min(1), stage: z.enum(MANUAL_STAGES), done: int,
    held: z.boolean(), holdNote: z.string().trim().max(300).optional(),
  }).safeParse({
    lineId: fd.get("lineId"), stage: fd.get("stage"), done: fd.get("done"),
    held: fd.get("held") === "on", holdNote: fd.get("holdNote") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!canUpdateStage(user.role, parsed.data.stage)) return { error: "Anda tidak berwenang memperbarui tahap ini." };
  const line = await db.productionOrderLine.findUnique({
    where: { projectLineId: parsed.data.lineId },
    include: { order: { select: { id: true, companyId: true, projectId: true } } },
  });
  if (!line || !inScope(user, line.order.companyId)) return { error: "Barang tidak ditemukan." };
  try {
    await db.$transaction((tx) => updateStage(tx, parsed.data));
  } catch (e) {
    return { error: message(e) };
  }
  await audit(user.id, "so.tahap", line.order.id, parsed.data);
  revalidatePath(`/sales-order/${line.order.id}`);
  revalidatePath("/sales-order");
  revalidatePath(`/proyek/${line.order.projectId}`);
  return { ok: "Progres tersimpan." };
}
