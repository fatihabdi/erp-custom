"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { createQuotation, setQuotationStatus, updateQuotation } from "@/lib/documents";
import { audit, companyAllowed, dateField, docError, int, parseJson, rupiah, termsSchema } from "@/lib/doc-actions";
import type { FormState } from "@/components/action-form";

const schema = z.object({
  id: z.string().optional(),
  companyId: z.string().optional(),
  customerId: z.string().min(1, "Pilih pelanggan"),
  date: dateField,
  attn: z.string().trim().max(120).optional(),
  subject: z.string().trim().min(1, "Perihal wajib diisi").max(200),
  notes: z.string().trim().max(1000).optional(),
  lines: z.array(z.object({
    description: z.string().trim().min(1, "Uraian barang wajib diisi").max(200),
    spec: z.string().trim().max(300).optional(),
    qty: int, unit: z.string().trim().min(1, "Satuan wajib diisi").max(20), unitPrice: rupiah,
    productId: z.string().optional(),
  })),
  terms: termsSchema,
});

export async function saveQuotationAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = schema.safeParse({
    id: fd.get("id") || undefined, companyId: fd.get("companyId") || undefined, customerId: fd.get("customerId"),
    date: fd.get("date"), attn: fd.get("attn") || undefined, subject: fd.get("subject"), notes: fd.get("notes") || undefined,
    lines: parseJson(fd.get("lines")), terms: parseJson(fd.get("terms")),
  });
  const user = await requirePermission("penawaran", parsed.success && parsed.data.id ? "edit" : "create");
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  let id: string;
  try {
    if (d.id) {
      const q = await db.quotation.findUnique({ where: { id: d.id }, select: { companyId: true } });
      if (!q || !companyAllowed(user, q.companyId)) return { error: "Penawaran tidak ditemukan." };
      id = (await db.$transaction((tx) => updateQuotation(tx, d.id!, d))).id;
    } else {
      if (!d.companyId) return { error: "Pilih perusahaan" };
      if (!companyAllowed(user, d.companyId)) return { error: "Anda tidak punya akses ke perusahaan ini." };
      id = (await db.$transaction((tx) => createQuotation(tx, { ...d, companyId: d.companyId!, date: d.date ?? undefined, userId: user.id }))).id;
    }
  } catch (e) {
    return { error: docError(e) };
  }
  await audit(user.id, d.id ? "penawaran.ubah" : "penawaran.buat", "Quotation", id);
  revalidatePath("/penawaran");
  redirect(`/penawaran/${id}`);
}

export async function quotationStatusAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("penawaran", "edit");
  const id = String(fd.get("id"));
  const to = z.enum(["DRAFT", "TERKIRIM", "DISETUJUI", "DITOLAK", "BATAL"]).safeParse(fd.get("to"));
  if (!to.success) return { error: "Status tidak valid" };
  const q = await db.quotation.findUnique({ where: { id }, select: { companyId: true } });
  if (!q || !companyAllowed(user, q.companyId)) return { error: "Penawaran tidak ditemukan." };
  try {
    await db.$transaction((tx) => setQuotationStatus(tx, id, to.data));
  } catch (e) {
    return { error: docError(e) };
  }
  await audit(user.id, "penawaran.status", "Quotation", id, { to: to.data });
  revalidatePath(`/penawaran/${id}`);
  revalidatePath("/penawaran");
  return { ok: "Status diperbarui." };
}
