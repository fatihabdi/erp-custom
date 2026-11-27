import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MANUAL_TYPES } from "@/lib/stock";
import { toDateInput } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MovementForm } from "./movement-form";

export default async function MutasiBaruPage({ searchParams }: { searchParams: Promise<{ jenis?: string; barang?: string }> }) {
  const user = await requirePermission("inventory", "edit");
  const sp = await searchParams;
  const type = MANUAL_TYPES.find((t) => t === sp.jenis) ?? "MASUK";
  const [items, projects, suppliers] = await Promise.all([
    db.item.findMany({
      where: { active: true }, orderBy: [{ kind: "desc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, unit: true, kind: true, onHand: true, unitCost: true },
    }),
    db.project.findMany({
      where: { status: "BERJALAN" }, orderBy: { code: "desc" }, take: 300,
      select: { id: true, code: true, name: true },
    }),
    db.stockMovement.findMany({
      where: { supplier: { not: null } }, distinct: ["supplier"], orderBy: { createdAt: "desc" }, take: 50,
      select: { supplier: true },
    }),
  ]);
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mutasi stok</h1>
      </div>
      <Card>
        <CardHeader><CardTitle>Catat mutasi</CardTitle></CardHeader>
        <CardContent>
          <MovementForm
            type={type}
            itemId={sp.barang}
            today={toDateInput(new Date())}
            items={items.map((i) => ({ id: i.id, code: i.code, name: i.name, unit: i.unit, kind: i.kind, onHand: Number(i.onHand), unitCost: Number(i.unitCost) }))}
            projects={projects}
            suppliers={suppliers.map((s) => s.supplier!).filter(Boolean)}
            canCreateMaterial={can(user.role, "inventory", "create")}
            canCreateProduct={can(user.role, "produk", "create")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
