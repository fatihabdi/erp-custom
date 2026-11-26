import { z } from "zod";
import { issueMaterialsForProduction } from "@/lib/inventory";
import { stockEndpoint } from "@/lib/inventory-api";

// Pakai bahan baku untuk produksi sesuai BOM (semua-atau-tidak-sama-sekali). Idempoten per `productionId`.
const schema = z.object({
  productId: z.string().min(1),
  units: z.number().positive(),
  productionId: z.string().min(1),
});

export async function POST(request: Request) {
  return stockEndpoint(request, schema, async (tx, b, userId) => {
    const results = await issueMaterialsForProduction(tx, { ...b, userId });
    return results.map((r) => ({ itemId: r.movement.itemId, qty: Number(r.movement.qty), duplicate: r.duplicate }));
  });
}
