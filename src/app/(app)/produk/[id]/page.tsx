import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can, canSeeProductCost } from "@/lib/permissions";
import { getBom } from "@/lib/inventory";
import { CATEGORY_LABEL, marginPercent, TYPE_LABEL, type ProductCategoryName, type ProductTypeName } from "@/lib/product";
import { fmtQty, fmtRpFull } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateProductAction } from "../actions";
import { ProductImageForms } from "../image-forms";
import { ProductForm } from "../product-form";

export default async function ProdukDetailPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ tersimpan?: string }> }) {
  const user = await requirePermission("produk");
  const { id } = await params;
  const sp = await searchParams;
  const product = await db.product.findUnique({
    where: { id }, include: { item: true, image: { select: { productId: true } } },
  });
  if (!product || !product.item) notFound();
  const canEdit = can(user.role, "produk", "edit");
  const showCost = canSeeProductCost(user.role);
  const price = Number(product.price);
  const cost = Number(product.cost);
  const margin = showCost ? marginPercent(price, cost) : null;
  const bom = product.type === "PRODUKSI" ? await getBom(db, product.item.id) : [];
  const canSeeStock = can(user.role, "inventory");

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
          <p className="text-sm text-muted-foreground">
            {product.code} · {CATEGORY_LABEL[product.category as ProductCategoryName]} · {TYPE_LABEL[product.type as ProductTypeName]}
          </p>
        </div>
        <Badge dot={product.active ? "green" : "gray"}>{product.active ? "Aktif" : "Nonaktif"}</Badge>
      </div>

      {sp.tersimpan && <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm">Produk tersimpan.</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat title="Harga jual (belum PPN)" value={fmtRpFull(price)} hint="Acuan; bisa diubah per penawaran" />
        {showCost && <Stat title="Harga pokok" value={fmtRpFull(cost)} hint={margin == null ? "Margin belum bisa dihitung" : `Margin kotor ${margin}%`} />}
        <Stat title="Stok" value={`${fmtQty(Number(product.item.onHand))} ${product.unit}`} hint={canSeeStock ? "Kelola di modul Stok" : "Dikelola Gudang"} />
      </div>

      <Card>
        <CardHeader><CardTitle>Data produk</CardTitle></CardHeader>
        <CardContent>
          {canEdit ? (
            <ProductForm
              action={updateProductAction} showCost={showCost} cancelHref="/produk"
              initial={{
                id: product.id, name: product.name, category: product.category, type: product.type, unit: product.unit,
                size: product.size ?? "", material: product.material ?? "", spec: product.spec ?? "",
                price: String(price), cost: String(cost), active: product.active,
              }}
            />
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Field label="Satuan" value={product.unit} />
              <Field label="Ukuran" value={product.size} />
              <Field label="Bahan" value={product.material} />
              <Field label="Spesifikasi" value={product.spec} />
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Gambar</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/produk/${product.id}/gambar`} alt={product.name} className="max-h-64 w-fit rounded-lg border border-border object-contain" />
          ) : <p className="text-sm text-muted-foreground">Belum ada gambar.</p>}
          {canEdit && <ProductImageForms id={product.id} hasImage={!!product.image} />}
        </CardContent>
      </Card>

      {product.type === "PRODUKSI" ? (
        <Card>
          <CardHeader>
            <CardTitle>BOM (bahan per 1 {product.unit})</CardTitle>
            <p className="text-sm text-muted-foreground">BOM menempel ke produk ini dan dikelola Gudang di modul Stok.</p>
          </CardHeader>
          <CardContent>
            {bom.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada BOM.</p> : (
              <ul className="text-sm">{bom.map((l) => <li key={l.id}>{l.material.code} — {l.material.name}: {fmtQty(l.qty)} {l.material.unit}</li>)}</ul>
            )}
            {canSeeStock && (
              <Button asChild variant="outline" size="sm" className="mt-3"><Link href={`/inventory/barang/${product.item.id}`}>Buka di Stok</Link></Button>
            )}
          </CardContent>
        </Card>
      ) : canSeeStock && (
        <Card>
          <CardHeader><CardTitle>Barang dagang</CardTitle><p className="text-sm text-muted-foreground">Dibeli jadi, tanpa BOM dan tanpa tahap produksi. Catat pembelian sebagai stok masuk.</p></CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm"><Link href={`/inventory/mutasi/baru?barang=${product.item.id}`}>Catat stok masuk</Link></Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return <div><dt className="text-muted-foreground">{label}</dt><dd className="whitespace-pre-line">{value || "—"}</dd></div>;
}
