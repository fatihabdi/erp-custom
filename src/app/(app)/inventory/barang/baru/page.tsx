import { requirePermission } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewItemForm } from "./new-item-form";

export default async function BarangBaruPage() {
  await requirePermission("inventory", "create");
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bahan baku baru</h1>
      </div>
      <Card>
        <CardHeader><CardTitle>Data bahan baku</CardTitle></CardHeader>
        <CardContent><NewItemForm /></CardContent>
      </Card>
    </div>
  );
}
