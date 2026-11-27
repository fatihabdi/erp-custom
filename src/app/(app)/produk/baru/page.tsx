import { requirePermission } from "@/lib/auth";
import { canSeeProductCost } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createProductAction } from "../actions";
import { EMPTY_PRODUCT, ProductForm } from "../product-form";

export default async function ProdukBaruPage() {
  const user = await requirePermission("produk", "create");
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Produk baru</h1>
        <p className="text-sm text-muted-foreground">Kode dibuat otomatis. Gambar bisa ditambahkan setelah produk tersimpan.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Data produk</CardTitle></CardHeader>
        <CardContent>
          <ProductForm action={createProductAction} initial={EMPTY_PRODUCT} showCost={canSeeProductCost(user.role)} cancelHref="/produk" />
        </CardContent>
      </Card>
    </div>
  );
}
