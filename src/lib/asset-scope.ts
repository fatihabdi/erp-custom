import type { Prisma } from "@/generated/prisma/client";

/** Pengguna yang dibatasi ke perusahaan tertentu hanya melihat aset perusahaannya. */
export function assetScope(user: { companies: { id: string }[] }): Prisma.AssetWhereInput {
  return user.companies.length === 0 ? {} : { companyId: { in: user.companies.map((c) => c.id) } };
}

/** Pengguna tanpa pembatasan boleh semua perusahaan. */
export function canUseCompany(user: { companies: { id: string }[] }, companyId: string): boolean {
  return user.companies.length === 0 || user.companies.some((c) => c.id === companyId);
}
