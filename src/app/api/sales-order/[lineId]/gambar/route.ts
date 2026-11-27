import { apiUser } from "@/lib/api-auth";
import { db } from "@/lib/db";

// Gambar acuan barang pada Sales Order.
export async function GET(_: Request, ctx: { params: Promise<{ lineId: string }> }) {
  const auth = await apiUser("sales-order", "view");
  if (auth.error) return auth.error;
  const { lineId } = await ctx.params;
  const img = await db.productionOrderImage.findUnique({ where: { lineId }, include: { line: { select: { order: { select: { companyId: true } } } } } });
  if (!img || (auth.user.companies.length > 0 && !auth.user.companies.some((c) => c.id === img.line.order.companyId))) {
    return Response.json({ error: "Gambar tidak ditemukan." }, { status: 404 });
  }
  return new Response(new Uint8Array(img.data), {
    headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" },
  });
}
