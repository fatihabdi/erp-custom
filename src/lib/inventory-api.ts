import { z } from "zod";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/api-auth";
import { InsufficientStockError, NotFoundError } from "@/lib/inventory";
import { StockRuleError } from "@/lib/stock";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Pembungkus endpoint stok untuk modul Proyek: cek sesi + hak akses (proyek: edit),
 * validasi isi, jalankan dalam satu transaksi, dan ubah galat stok menjadi respons JSON.
 */
export async function stockEndpoint<S extends z.ZodType>(
  request: Request,
  schema: S,
  run: (tx: Prisma.TransactionClient, body: z.infer<S>, userId: string) => Promise<unknown>,
) {
  const auth = await apiUser("proyek", "edit");
  if (auth.error) return auth.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  try {
    const result = await db.$transaction((tx) => run(tx, parsed.data, auth.user.id));
    return Response.json({ ok: true, result });
  } catch (e) {
    if (e instanceof InsufficientStockError) return Response.json({ error: e.message, shortages: e.shortages }, { status: 409 });
    if (e instanceof NotFoundError) return Response.json({ error: e.message }, { status: 404 });
    if (e instanceof StockRuleError) return Response.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
