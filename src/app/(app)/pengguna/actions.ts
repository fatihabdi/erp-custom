"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ROLES } from "@/lib/permissions";

const schema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi"),
  email: z.string().trim().toLowerCase().email("Email tidak valid"),
  password: z.string().min(8, "Kata sandi minimal 8 karakter"),
  role: z.enum(ROLES),
  companyIds: z.array(z.string()).min(1, "Pilih minimal satu perusahaan"),
});

export async function createUser(_: { error?: string; ok?: boolean } | undefined, formData: FormData) {
  const actor = await requirePermission("pengguna", "create");
  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    companyIds: formData.getAll("companyIds").map(String),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { companyIds, password, ...data } = parsed.data;

  // Hanya Direktur yang boleh membuat Direktur lain.
  if (data.role === "DIREKTUR" && actor.role !== "DIREKTUR") {
    return { error: "Hanya Direktur yang dapat membuat akun Direktur." };
  }
  if (await db.user.findUnique({ where: { email: data.email } })) {
    return { error: "Email sudah terdaftar." };
  }

  const user = await db.user.create({
    data: {
      ...data,
      passwordHash: await bcrypt.hash(password, 12),
      companies: { create: companyIds.map((companyId) => ({ companyId })) },
    },
  });
  await db.auditLog.create({
    data: { userId: actor.id, action: "user.create", entity: "User", entityId: user.id, detail: { role: data.role } },
  });
  revalidatePath("/pengguna");
  return { ok: true };
}

export async function setUserActive(formData: FormData) {
  const actor = await requirePermission("pengguna", "edit");
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";
  if (id === actor.id) return; // tidak boleh menonaktifkan diri sendiri
  const target = await db.user.findUnique({ where: { id } });
  if (!target || (target.role === "DIREKTUR" && actor.role !== "DIREKTUR")) return;
  await db.user.update({ where: { id }, data: { active } });
  await db.auditLog.create({
    data: { userId: actor.id, action: active ? "user.activate" : "user.deactivate", entity: "User", entityId: id },
  });
  revalidatePath("/pengguna");
}
