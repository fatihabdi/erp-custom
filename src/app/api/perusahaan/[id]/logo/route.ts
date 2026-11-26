import { apiUser } from "@/lib/api-auth";
import { db } from "@/lib/db";

// Logo perusahaan untuk pratinjau di halaman Pengaturan.
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await apiUser("pengaturan", "view");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  if (auth.user.companies.length > 0 && !auth.user.companies.some((c) => c.id === id)) return Response.json({ error: "Tidak punya akses." }, { status: 403 });
  const logo = await db.companyLogo.findUnique({ where: { companyId: id } });
  if (!logo) return Response.json({ error: "Belum ada logo." }, { status: 404 });
  return new Response(new Uint8Array(logo.data), { headers: { "Content-Type": logo.mime, "Cache-Control": "private, max-age=300" } });
}
