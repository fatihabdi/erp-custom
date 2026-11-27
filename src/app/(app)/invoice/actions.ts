"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { createInvoice, recordPayment, voidInvoice, voidPayment } from "@/lib/documents";
import { audit, companyAllowed, dateField, docError, rupiah } from "@/lib/doc-actions";
import type { FormState } from "@/components/action-form";

export async function createInvoiceAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("invoice", "create");
  const parsed = z.object({
    projectId: z.string().min(1), termId: z.string().min(1, "Pilih termin"), date: dateField, dueDate: dateField, deliveryId: z.string().optional(),
  }).safeParse({
    projectId: fd.get("projectId"), termId: fd.get("termId"), date: fd.get("date"), dueDate: fd.get("dueDate"), deliveryId: fd.get("deliveryId") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const p = await db.project.findUnique({ where: { id: d.projectId }, select: { companyId: true } });
  if (!p?.companyId || !companyAllowed(user, p.companyId)) return { error: "Proyek tidak ditemukan." };
  let id: string;
  try {
    id = (await db.$transaction((tx) => createInvoice(tx, { ...d, date: d.date ?? undefined, userId: user.id }))).id;
  } catch (e) {
    return { error: docError(e) };
  }
  await audit(user.id, "invoice.buat", "Invoice", id, { termId: d.termId });
  revalidatePath("/invoice"); revalidatePath(`/order`); revalidatePath(`/proyek/${d.projectId}`);
  redirect(`/invoice/${id}`);
}

async function scopedInvoice(user: { companies: { id: string }[] }, id: string) {
  const i = await db.invoice.findUnique({ where: { id }, select: { companyId: true, projectId: true } });
  return i && companyAllowed(user, i.companyId) ? i : null;
}

export async function recordPaymentAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("kwitansi", "create");
  await requirePermission("invoice", "edit");
  const parsed = z.object({
    invoiceId: z.string().min(1), amount: rupiah, date: dateField, method: z.enum(["TRANSFER", "TUNAI", "CEK_GIRO", "LAIN"]),
    note: z.string().trim().max(300).optional(),
  }).safeParse({
    invoiceId: fd.get("invoiceId"), amount: fd.get("amount"), date: fd.get("date"), method: fd.get("method"), note: fd.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const inv = await scopedInvoice(user, d.invoiceId);
  if (!inv) return { error: "Invoice tidak ditemukan." };
  let paymentId: string;
  try {
    paymentId = (await db.$transaction((tx) => recordPayment(tx, { ...d, date: d.date ?? undefined, userId: user.id }))).id;
  } catch (e) {
    return { error: docError(e) };
  }
  await audit(user.id, "pembayaran.catat", "Payment", paymentId, { invoiceId: d.invoiceId, amount: d.amount });
  revalidatePath(`/invoice/${d.invoiceId}`); revalidatePath("/invoice"); revalidatePath("/kwitansi"); revalidatePath(`/proyek/${inv.projectId}`);
  return { ok: "Pembayaran dicatat dan kwitansi terbit." };
}

export async function voidPaymentAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("kwitansi", "edit");
  const id = String(fd.get("paymentId"));
  const pay = await db.payment.findUnique({ where: { id }, select: { invoiceId: true } });
  if (!pay || !(await scopedInvoice(user, pay.invoiceId))) return { error: "Kwitansi tidak ditemukan." };
  try {
    await db.$transaction((tx) => voidPayment(tx, id, String(fd.get("reason") ?? "")));
  } catch (e) {
    return { error: docError(e) };
  }
  await audit(user.id, "pembayaran.batal", "Payment", id);
  revalidatePath(`/invoice/${pay.invoiceId}`); revalidatePath("/invoice"); revalidatePath("/kwitansi");
  return { ok: "Kwitansi dibatalkan." };
}

export async function voidInvoiceAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("invoice", "edit");
  const id = String(fd.get("invoiceId"));
  if (!(await scopedInvoice(user, id))) return { error: "Invoice tidak ditemukan." };
  try {
    await db.$transaction((tx) => voidInvoice(tx, id, String(fd.get("reason") ?? "")));
  } catch (e) {
    return { error: docError(e) };
  }
  await audit(user.id, "invoice.batal", "Invoice", id);
  revalidatePath(`/invoice/${id}`); revalidatePath("/invoice"); revalidatePath("/order");
  return { ok: "Invoice dibatalkan. Termin bisa ditagih ulang." };
}
