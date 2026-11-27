import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewAssetForm } from "./new-asset-form";

export default async function AsetBaruPage() {
  const user = await requirePermission("aset", "create");
  const [companies, categories] = await Promise.all([
    db.company.findMany({ where: { active: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    db.assetCategory.findMany({ where: { active: true }, orderBy: [{ type: "asc" }, { name: "asc" }], select: { id: true, name: true, type: true, usefulLifeMonths: true } }),
  ]);
  const allowed = user.companies.length ? companies.filter((c) => user.companies.some((u) => u.id === c.id)) : companies;
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground"><Link href="/aset" className="hover:underline">Aset</Link> / Aset baru</p>
        <h1 className="text-2xl font-semibold">Aset baru</h1>
      </div>
      <Card>
        <CardHeader><CardTitle>Data aset</CardTitle></CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada kategori. <Link href="/aset/kategori" className="underline">Buat kategori dulu</Link>.</p>
          ) : (
            <NewAssetForm companies={allowed} categories={categories} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
