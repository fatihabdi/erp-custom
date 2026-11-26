"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import type { FormState } from "@/components/action-form";

const opt = z.string().trim().max(200).optional();
const schema = z.object({
  name: z.string().trim().min(1, "Nama pelanggan wajib diisi").max(160),
  contact: opt, phone: opt, email: z.string().trim().max(120).optional(), address: z.string().trim().max(300).optional(),
  taxId: opt, notes: z.string().trim().max(300).optional(),
});
const read = (fd: FormData) => schema.safeParse({
  name: fd.get("name"), contact: fd.get("contact") || undefined, phone: fd.get("phone") || undefined,
  email: fd.get("email") || undefined, address: fd.get("address") || undefined, taxId: fd.get("taxId") || undefined,
  notes: fd.get("notes") || undefined,
});

// Pelanggan dikelola oleh yang membuat pesanan (modul order): Marketing, Admin, Direktur.
export async function createCustomer(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("order", "create");
  const parsed = read(fd);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const c = await db.customer.create({ data: parsed.data });
  await db.auditLog.create({ data: { userId: user.id, action: "pelanggan.create", entity: "Customer", entityId: c.id } });
  revalidatePath("/pelanggan");
  const next = String(fd.get("next") ?? "");
  redirect(next.startsWith("/proyek/baru") ? `${next}${next.includes("?") ? "&" : "?"}pelanggan=${c.id}` : "/pelanggan");
}

export async function updateCustomer(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("order", "edit");
  const parsed = read(fd);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const id = String(fd.get("id"));
  await db.customer.update({ where: { id }, data: { ...parsed.data, active: fd.get("active") === "on" } });
  await db.auditLog.create({ data: { userId: user.id, action: "pelanggan.update", entity: "Customer", entityId: id } });
  revalidatePath("/pelanggan");
  return { ok: "Tersimpan." };
}
