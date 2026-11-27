"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { audit, companyAllowed } from "@/lib/doc-actions";
import { checkLogo } from "@/lib/logo";
import type { FormState } from "@/components/action-form";

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

export async function saveCompanyAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("pengaturan", "edit");
  const parsed = z.object({
    id: z.string().min(1), name: z.string().trim().min(1, "Nama perusahaan wajib diisi").max(160),
    address: opt(300), city: opt(80), phone: opt(60), email: z.string().trim().max(120).optional().transform((v) => v || null),
    bankName: opt(80), bankAccount: opt(60), bankHolder: opt(120), signatoryName: opt(120), signatoryTitle: opt(120),
  }).safeParse(Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...data } = parsed.data;
  if (data.email && !z.email().safeParse(data.email).success) return { error: "Format email tidak valid." };
  if (!companyAllowed(user, id)) return { error: "Anda tidak punya akses ke perusahaan ini." };
  await db.company.update({ where: { id }, data });
  await audit(user.id, "perusahaan.ubah", "Company", id);
  revalidatePath("/pengaturan");
  return { ok: "Data perusahaan tersimpan." };
}

export async function uploadLogoAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("pengaturan", "edit");
  const id = String(fd.get("id"));
  const file = fd.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "Pilih berkas logo." };
  if (!companyAllowed(user, id)) return { error: "Anda tidak punya akses ke perusahaan ini." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkLogo(bytes);
  if (!check.ok) return { error: check.error };
  const data = Buffer.from(bytes);
  await db.companyLogo.upsert({ where: { companyId: id }, create: { companyId: id, data, mime: check.mime }, update: { data, mime: check.mime } });
  await audit(user.id, "perusahaan.logo", "Company", id);
  revalidatePath("/pengaturan");
  return { ok: "Logo tersimpan." };
}

export async function removeLogoAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("pengaturan", "edit");
  const id = String(fd.get("id"));
  if (!companyAllowed(user, id)) return { error: "Anda tidak punya akses ke perusahaan ini." };
  await db.companyLogo.deleteMany({ where: { companyId: id } });
  await audit(user.id, "perusahaan.logo.hapus", "Company", id);
  revalidatePath("/pengaturan");
  return { ok: "Logo dihapus." };
}
