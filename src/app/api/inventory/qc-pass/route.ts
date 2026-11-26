import { z } from "zod";
import { receiveFinishedGoodsAtQc } from "@/lib/inventory";
import { stockEndpoint } from "@/lib/inventory-api";

// Barang jadi masuk stok saat QC lulus. Idempoten per `qcId`.
const schema = z.object({
  productId: z.string().min(1),
  qty: z.number().positive(),
  qcId: z.string().min(1),
  projectId: z.string().optional(),
  note: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  return stockEndpoint(request, schema, async (tx, b, userId) => {
    const { movement, duplicate } = await receiveFinishedGoodsAtQc(tx, { ...b, userId });
    return { movementId: movement.id, balanceAfter: Number(movement.balanceAfter), duplicate };
  });
}
