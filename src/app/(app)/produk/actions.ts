"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { canSeeProductCost } from "@/lib/permissions";
import { createProduct, PRODUCT_CATEGORIES, PRODUCT_TYPES, ProductRuleError, updateProduct } from "@/lib/product";
import { checkSoImage } from "@/lib/sales-order";
import { audit, rupiah } from "@/lib/doc-actions";
import type { FormState } from "@/components/action-form";

const schema = z.object({
  name: z.string().trim().min(1, "Nama produk wajib diisi").max(160),
  category: z.enum(PRODUCT_CATEGORIES, { error: "Pilih kategori" }),
  type: z.enum(PRODUCT_TYPES, { error: "Pilih tipe produk" }),
  unit: z.string().trim().min(1, "Satuan wajib diisi").max(20),
  size: z.string().trim().max(120).optional(),
  material: z.string().trim().max(120).optional(),
  spec: z.string().trim().max(2000).optional(),
  price: rupiah.refine((n) => n >= 0, "Harga jual tidak boleh negatif"),
  cost: rupiah.refine((n) => n >= 0, "Harga pokok tidak boleh negatif"),
});

function parse(fd: FormData) {
  const opt = (k: string) => (fd.get(k) ? String(fd.get(k)) : undefined);
  return schema.safeParse({
    name: fd.get("name"), category: fd.get("category"), type: fd.get("type"), unit: fd.get("unit"),
    size: opt("size"), material: opt("material"), spec: opt("spec"),
    price: fd.get("price") || "0", cost: fd.get("cost") || "0",
  });
}

function message(e: unknown): string {
  if (e instanceof ProductRuleError) return e.message;
  if (typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "P2002") return "Kode produk bentrok, silakan coba lagi.";
  throw e;
}

export async function createProductAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("produk", "create");
  const parsed = parse(fd);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // Harga pokok hanya boleh diisi peran yang boleh melihatnya.
  const d = { ...parsed.data, cost: canSeeProductCost(user.role) ? parsed.data.cost : 0 };
  let id: string;
  try {
    id = (await db.$transaction((tx) => createProduct(tx, d))).product.id;
  } catch (e) {
    return { error: message(e) };
  }
  await audit(user.id, "produk.buat", "Product", id);
  revalidatePath("/produk");
  redirect(`/produk/${id}?tersimpan=1`);
}

export async function updateProductAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("produk", "edit");
  const id = String(fd.get("id") ?? "");
  const parsed = parse(fd);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await db.$transaction(async (tx) => {
      const cur = await tx.product.findUnique({ where: { id }, select: { cost: true } });
      if (!cur) throw new ProductRuleError("Produk tidak ditemukan.");
      const cost = canSeeProductCost(user.role) ? parsed.data.cost : Number(cur.cost);
      await updateProduct(tx, id, { ...parsed.data, cost, active: fd.get("active") === "on" });
    });
  } catch (e) {
    return { error: message(e) };
  }
  await audit(user.id, "produk.ubah", "Product", id);
  revalidatePath("/produk");
  revalidatePath(`/produk/${id}`);
  return { ok: "Tersimpan." };
}

export async function uploadProductImageAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("produk", "edit");
  const id = String(fd.get("id") ?? "");
  if (!(await db.product.findUnique({ where: { id }, select: { id: true } }))) return { error: "Produk tidak ditemukan." };
  const file = fd.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Pilih berkas gambar." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkSoImage(bytes);
  if (!check.ok) return { error: check.error };
  const data = Buffer.from(bytes);
  await db.productImage.upsert({ where: { productId: id }, create: { productId: id, data, mime: check.mime }, update: { data, mime: check.mime } });
  await audit(user.id, "produk.gambar", "Product", id);
  revalidatePath(`/produk/${id}`);
  return { ok: "Gambar tersimpan." };
}

export async function removeProductImageAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("produk", "edit");
  const id = String(fd.get("id") ?? "");
  await db.productImage.deleteMany({ where: { productId: id } });
  await audit(user.id, "produk.gambar.hapus", "Product", id);
  revalidatePath(`/produk/${id}`);
  return { ok: "Gambar dihapus." };
}
