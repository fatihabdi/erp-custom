import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { MANUAL_TYPES } from "@/lib/stock";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MovementForm } from "./movement-form";

export default async function MutasiBaruPage({ searchParams }: { searchParams: Promise<{ jenis?: string; barang?: string }> }) {
  await requirePermission("inventory", "edit");
  const sp = await searchParams;
  const type = MANUAL_TYPES.find((t) => t === sp.jenis) ?? "MASUK";
  const items = await db.item.findMany({
    where: { active: true }, orderBy: [{ kind: "desc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, unit: true, kind: true, onHand: true },
  });
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground"><Link href="/inventory" className="hover:underline">Stok</Link> / Mutasi baru</p>
        <h1 className="text-2xl font-semibold">Mutasi stok</h1>
      </div>
      <Card>
        <CardHeader><CardTitle>Catat mutasi</CardTitle></CardHeader>
        <CardContent>
          <MovementForm
            type={type}
            itemId={sp.barang}
            items={items.map((i) => ({ ...i, onHand: Number(i.onHand) }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
