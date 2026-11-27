import { apiUser } from "@/lib/api-auth";
import { db } from "@/lib/db";

// Gambar produk di katalog. Hanya peran yang boleh melihat Master Produk.
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await apiUser("produk", "view");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const img = await db.productImage.findUnique({ where: { productId: id } });
  if (!img) return Response.json({ error: "Gambar tidak ditemukan." }, { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" },
  });
}
