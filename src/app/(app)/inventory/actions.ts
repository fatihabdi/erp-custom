"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { applyMovement, InsufficientStockError, nextItemCode, setBom } from "@/lib/inventory";
import { MANUAL_TYPES, round3, StockRuleError } from "@/lib/stock";

export type FormState = { error?: string; ok?: string } | undefined;

// Angka dari formulir: terima koma desimal ("1,5").
const numField = z.preprocess(
  (v) => (typeof v === "string" ? Number(v.trim().replace(",", ".")) : v),
  z.number({ error: "Jumlah tidak valid" }),
);

function message(e: unknown): string {
  if (e instanceof InsufficientStockError || e instanceof StockRuleError) return e.message;
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "Kode atau data yang sama sudah ada.";
  throw e;
}

const movementSchema = z.object({
  type: z.enum(MANUAL_TYPES),
  itemId: z.string().min(1, "Pilih barang"),
  qty: numField,
  note: z.string().trim().max(300).optional(),
});

export async function createMovement(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("inventory", "edit");
  const parsed = movementSchema.safeParse({
    type: fd.get("type"), itemId: fd.get("itemId"), qty: fd.get("qty"), note: fd.get("note") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { type, itemId, qty, note } = parsed.data;
  // Penyesuaian dimasukkan sebagai selisih bertanda (+/-); jenis lain sebagai jumlah positif.
  try {
    await db.$transaction((tx) => applyMovement(tx, { itemId, type, qty, note, userId: user.id }));
  } catch (e) {
    return { error: message(e) };
  }
  await db.auditLog.create({ data: { userId: user.id, action: `stok.${type.toLowerCase()}`, entity: "Item", entityId: itemId, detail: { qty, note } } });
  revalidatePath("/inventory");
  redirect("/inventory?tersimpan=1");
}

const itemSchema = z.object({
  kind: z.enum(["RAW", "FINISHED"]),
  name: z.string().trim().min(1, "Nama wajib diisi").max(120),
  unit: z.string().trim().min(1, "Satuan wajib diisi").max(20),
  minStock: numField.refine((n) => n >= 0, "Stok minimum tidak boleh negatif"),
  notes: z.string().trim().max(300).optional(),
});

export async function createItem(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("inventory", "create");
  const parsed = itemSchema.safeParse({
    kind: fd.get("kind"), name: fd.get("name"), unit: fd.get("unit"),
    minStock: fd.get("minStock") || "0", notes: fd.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  let id: string;
  try {
    id = await db.$transaction(async (tx) => {
      const code = await nextItemCode(tx, d.kind);
      const item = await tx.item.create({ data: { ...d, minStock: round3(d.minStock), code } });
      return item.id;
    });
  } catch (e) {
    return { error: message(e) };
  }
  await db.auditLog.create({ data: { userId: user.id, action: "item.create", entity: "Item", entityId: id } });
  revalidatePath("/inventory");
  redirect(`/inventory/barang/${id}`);
}

export async function updateItem(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("inventory", "edit");
  const id = String(fd.get("id"));
  const parsed = itemSchema.omit({ kind: true }).safeParse({
    name: fd.get("name"), unit: fd.get("unit"), minStock: fd.get("minStock") || "0", notes: fd.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  await db.item.update({
    where: { id },
    data: { name: d.name, unit: d.unit, minStock: round3(d.minStock), notes: d.notes ?? null, active: fd.get("active") === "on" },
  });
  await db.auditLog.create({ data: { userId: user.id, action: "item.update", entity: "Item", entityId: id } });
  revalidatePath("/inventory");
  revalidatePath(`/inventory/barang/${id}`);
  return { ok: "Tersimpan." };
}

const bomSchema = z.object({
  productId: z.string().min(1),
  lines: z.array(z.object({ materialId: z.string().min(1, "Pilih bahan"), qty: numField })),
});

export async function saveBom(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("inventory", "edit");
  let raw: unknown;
  try { raw = JSON.parse(String(fd.get("lines") ?? "[]")); } catch { return { error: "Data BOM rusak." }; }
  const parsed = bomSchema.safeParse({ productId: fd.get("productId"), lines: raw });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await db.$transaction((tx) => setBom(tx, parsed.data.productId, parsed.data.lines));
  } catch (e) {
    return { error: message(e) };
  }
  await db.auditLog.create({ data: { userId: user.id, action: "bom.update", entity: "Item", entityId: parsed.data.productId } });
  revalidatePath(`/inventory/barang/${parsed.data.productId}`);
  return { ok: "BOM tersimpan." };
}
