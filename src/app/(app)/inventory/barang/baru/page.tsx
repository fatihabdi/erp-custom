import { requirePermission } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewItemForm } from "./new-item-form";

export default async function BarangBaruPage({ searchParams }: { searchParams: Promise<{ jenis?: string }> }) {
  await requirePermission("inventory", "create");
  const { jenis } = await searchParams;
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Barang baru</h1>
      </div>
      <Card>
        <CardHeader><CardTitle>Data barang</CardTitle></CardHeader>
        <CardContent><NewItemForm kind={jenis === "RAW" ? "RAW" : "FINISHED"} /></CardContent>
      </Card>
    </div>
  );
}
