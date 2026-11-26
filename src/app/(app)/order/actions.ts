"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { convertQuotationToOrder, createOrderFromProject, markOrderSigned, setProjectTerms, updateOrderDoc } from "@/lib/documents";
import { audit, companyAllowed, dateField, docError, parseJson, termsSchema } from "@/lib/doc-actions";
import type { FormState } from "@/components/action-form";

const common = {
  date: dateField,
  dueDate: dateField,
  workDays: z.preprocess((v) => (v === "" || v == null ? null : Number(String(v).trim())), z.number().int("Waktu pengerjaan harus bilangan bulat").nullable()),
  deliveryLocation: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
};
const raw = (fd: FormData) => ({
  date: fd.get("date"), dueDate: fd.get("dueDate"), workDays: fd.get("workDays"),
  deliveryLocation: fd.get("deliveryLocation") || undefined, notes: fd.get("notes") || undefined,
});

export async function createOrderAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("order", "create");
  const source = z.enum(["penawaran", "proyek"]).safeParse(fd.get("source"));
  const sourceId = String(fd.get("sourceId") ?? "");
  if (!source.success || !sourceId) return { error: "Sumber dokumen tidak valid." };
  const parsed = z.object({ ...common, terms: termsSchema.optional(), productIds: z.record(z.string(), z.string()).optional() })
    .safeParse({ ...raw(fd), terms: parseJson(fd.get("terms"), undefined), productIds: parseJson(fd.get("productIds"), {}) });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  let orderId: string;
  try {
    if (source.data === "penawaran") {
      const q = await db.quotation.findUnique({ where: { id: sourceId }, select: { companyId: true } });
      if (!q || !companyAllowed(user, q.companyId)) return { error: "Penawaran tidak ditemukan." };
      orderId = await db.$transaction(async (tx) =>
        (await convertQuotationToOrder(tx, sourceId, { ...d, date: d.date ?? undefined, userId: user.id })).order.id);
    } else {
      const p = await db.project.findUnique({ where: { id: sourceId }, select: { companyId: true } });
      if (!p?.companyId || !companyAllowed(user, p.companyId)) return { error: "Proyek tidak ditemukan." };
      orderId = await db.$transaction(async (tx) =>
        (await createOrderFromProject(tx, sourceId, { ...d, date: d.date ?? undefined, userId: user.id })).id);
    }
  } catch (e) {
    return { error: docError(e) };
  }
  await audit(user.id, "order.buat", "SalesOrder", orderId, { source: source.data, sourceId });
  revalidatePath("/order"); revalidatePath("/proyek"); revalidatePath("/penawaran");
  redirect(`/order/${orderId}`);
}

async function loadScoped(user: { companies: { id: string }[] }, id: string) {
  const o = await db.salesOrder.findUnique({ where: { id }, select: { companyId: true, projectId: true } });
  return o && companyAllowed(user, o.companyId) ? o : null;
}

export async function updateOrderAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("order", "edit");
  const id = String(fd.get("id"));
  const parsed = z.object({ dueDate: common.dueDate, workDays: common.workDays, deliveryLocation: common.deliveryLocation, notes: common.notes })
    .safeParse(raw(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!(await loadScoped(user, id))) return { error: "Konfirmasi Order tidak ditemukan." };
  try {
    await db.$transaction((tx) => updateOrderDoc(tx, id, parsed.data));
  } catch (e) {
    return { error: docError(e) };
  }
  await audit(user.id, "order.ubah", "SalesOrder", id);
  revalidatePath(`/order/${id}`);
  return { ok: "Tersimpan." };
}

export async function signOrderAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("order", "edit");
  const id = String(fd.get("id"));
  if (!(await loadScoped(user, id))) return { error: "Konfirmasi Order tidak ditemukan." };
  const signed = fd.get("signed") === "1";
  try {
    await db.$transaction((tx) => markOrderSigned(tx, id, signed));
  } catch (e) {
    return { error: docError(e) };
  }
  await audit(user.id, signed ? "order.ttd" : "order.ttd.batal", "SalesOrder", id);
  revalidatePath(`/order/${id}`);
  return { ok: signed ? "Ditandai sudah ditandatangani pemesan." : "Tanda tangan dibatalkan." };
}

export async function setTermsAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("order", "edit");
  const id = String(fd.get("id"));
  const terms = termsSchema.safeParse(parseJson(fd.get("terms")));
  if (!terms.success) return { error: "Data termin tidak valid." };
  const o = await loadScoped(user, id);
  if (!o) return { error: "Konfirmasi Order tidak ditemukan." };
  try {
    await db.$transaction((tx) => setProjectTerms(tx, o.projectId, terms.data));
  } catch (e) {
    return { error: docError(e) };
  }
  await audit(user.id, "order.termin", "SalesOrder", id);
  revalidatePath(`/order/${id}`); revalidatePath("/invoice");
  return { ok: "Termin pembayaran disimpan." };
}

