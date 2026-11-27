import { requirePermission } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerForm } from "../customer-form";

export default async function PelangganBaruPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  await requirePermission("order", "create");
  const { next } = await searchParams;
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pelanggan baru</h1>
      </div>
      <Card><CardHeader><CardTitle>Data pelanggan</CardTitle></CardHeader><CardContent><CustomerForm next={next} /></CardContent></Card>
    </div>
  );
}
