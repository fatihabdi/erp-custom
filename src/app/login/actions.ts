"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/session";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

// Hash tiruan agar waktu respons sama untuk email yang tidak terdaftar.
const DUMMY_HASH = "$2b$12$GeQZ2f7DCHs1PFMJWCY6ku7MLB3g3xnV60bFJiByTWr.ENT21AGHq";

export type LoginState = { error?: string; email?: string } | undefined;

export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const parsed = schema.safeParse({
    email,
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Email atau kata sandi tidak valid.", email };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.active || !ok) return { error: "Email atau kata sandi salah.", email };

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await db.auditLog.create({ data: { userId: user.id, action: "login" } });
  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
