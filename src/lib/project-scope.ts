import type { Prisma } from "@/generated/prisma/client";

/** Pengguna yang dibatasi ke perusahaan tertentu hanya melihat proyek perusahaannya (produksi stok tanpa perusahaan tetap terlihat). */
export function projectScope(user: { companies: { id: string }[] }): Prisma.ProjectWhereInput {
  if (user.companies.length === 0) return {};
  return { OR: [{ companyId: null }, { companyId: { in: user.companies.map((c) => c.id) } }] };
}
