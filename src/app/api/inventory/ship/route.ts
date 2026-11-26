import { z } from "zod";
import { shipFinishedGoods } from "@/lib/inventory";
import { stockEndpoint } from "@/lib/inventory-api";

// Barang jadi keluar untuk pengiriman (boleh sebagian). Idempoten per `deliveryId` + produk.
const schema = z.object({
  productId: z.string().min(1),
  qty: z.number().positive(),
  deliveryId: z.string().min(1),
  note: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  return stockEndpoint(request, schema, async (tx, b, userId) => {
    const { movement, duplicate } = await shipFinishedGoods(tx, { ...b, userId });
    return { movementId: movement.id, balanceAfter: Number(movement.balanceAfter), duplicate };
  });
}
