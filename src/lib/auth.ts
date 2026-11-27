import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { readSessionUserId } from "@/lib/session";
import { can, homePath, type Action, type ModuleName, type RoleName } from "@/lib/permissions";

export const getCurrentUser = cache(async () => {
  const id = await readSessionUserId();
  if (!id) return null;
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, role: true, active: true,
      companies: { select: { company: { select: { id: true, code: true, name: true, ppnRate: true } } } },
    },
  });
  if (!user || !user.active) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as RoleName,
    companies: user.companies.map((c) => ({ ...c.company, ppnRate: Number(c.company.ppnRate) })),
  };
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Untuk halaman dan aksi server: pastikan pengguna punya hak akses. */
export async function requirePermission(module: ModuleName, action: Action = "view") {
  const user = await requireUser();
  if (!can(user.role, module, action)) redirect(`${homePath(user.role)}?akses=ditolak`);
  return user;
}
