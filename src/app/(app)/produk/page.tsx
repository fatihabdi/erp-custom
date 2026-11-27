import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can, canSeeProductCost } from "@/lib/permissions";
import { CATEGORY_LABEL, PRODUCT_CATEGORIES, PRODUCT_TYPES, TYPE_LABEL, type ProductCategoryName, type ProductTypeName } from "@/lib/product";
import { fmtQty, fmtRpFull } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type SP = { q?: string; kategori?: string; tipe?: string; status?: string; tersimpan?: string };

export default async function ProdukPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("produk");
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const kategori = PRODUCT_CATEGORIES.find((c) => c === sp.kategori);
  const tipe = PRODUCT_TYPES.find((t) => t === sp.tipe);
  const status = sp.status === "nonaktif" ? "nonaktif" : sp.status === "semua" ? "semua" : "aktif";
  const showCost = canSeeProductCost(user.role);

  const products = await db.product.findMany({
    where: {
      ...(kategori ? { category: kategori } : {}),
      ...(tipe ? { type: tipe } : {}),
      ...(status === "semua" ? {} : { active: status === "aktif" }),
      ...(q ? { OR: [
        { name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } },
        { material: { contains: q, mode: "insensitive" } }, { size: { contains: q, mode: "insensitive" } },
      ] } : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { item: { select: { id: true, onHand: true } }, image: { select: { productId: true } } },
  });
  const uncategorized = products.filter((p) => p.category === "LAINNYA" && p.price.toString() === "0").length;

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Master Produk</h1>
          <p className="text-sm text-muted-foreground">Katalog semua produk dan harga jual (belum PPN). Stok dikelola di modul Stok.</p>
        </div>
        {can(user.role, "produk", "create") && <Button asChild><Link href="/produk/baru">+ Produk</Link></Button>}
      </div>

      {uncategorized > 0 && (
        <p className="rounded-lg border border-border bg-muted p-3 text-sm">
          {uncategorized} produk belum punya harga jual dan masih berkategori “Lainnya” (hasil migrasi dari barang jadi lama). Lengkapi harga dan kategorinya.
        </p>
      )}

      <form className="flex flex-wrap gap-2">
        <div className="w-72"><Input name="q" defaultValue={q} placeholder="Cari nama, kode, bahan, ukuran…" aria-label="Cari produk" /></div>
        <Select name="kategori" defaultValue={kategori ?? ""} aria-label="Kategori" className="w-40">
          <option value="">Semua kategori</option>
          {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </Select>
        <Select name="tipe" defaultValue={tipe ?? ""} aria-label="Tipe" className="w-36">
          <option value="">Semua tipe</option>
          {PRODUCT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </Select>
        <Select name="status" defaultValue={status} aria-label="Status" className="w-36">
          <option value="aktif">Aktif</option>
          <option value="nonaktif">Nonaktif</option>
          <option value="semua">Semua status</option>
        </Select>
        <Button type="submit" variant="outline">Terapkan</Button>
      </form>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Kode</TH><TH>Nama produk</TH><TH>Kategori</TH><TH>Tipe</TH><TH>Satuan</TH>
                <TH className="text-right">Harga jual</TH>
                {showCost && <TH className="text-right">Harga pokok</TH>}
                <TH className="text-right">Stok</TH><TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {products.length === 0 && <TR><TD colSpan={showCost ? 9 : 8} className="py-8 text-center text-muted-foreground">Tidak ada produk.</TD></TR>}
              {products.map((p) => (
                <TR key={p.id}>
                  <TD className="whitespace-nowrap">{p.code}</TD>
                  <TD>
                    <Link href={`/produk/${p.id}`} className="hover:underline">{p.name}</Link>
                    {(p.size || p.material) && <div className="text-xs text-muted-foreground">{[p.size, p.material].filter(Boolean).join(" · ")}</div>}
                  </TD>
                  <TD>{CATEGORY_LABEL[p.category as ProductCategoryName]}</TD>
                  <TD>{TYPE_LABEL[p.type as ProductTypeName]}</TD>
                  <TD>{p.unit}</TD>
                  <TD className="text-right tabular-nums">{fmtRpFull(Number(p.price))}</TD>
                  {showCost && <TD className="text-right tabular-nums">{fmtRpFull(Number(p.cost))}</TD>}
                  <TD className="text-right tabular-nums">{fmtQty(Number(p.item?.onHand ?? 0))}</TD>
                  <TD><Badge dot={p.active ? "green" : "gray"}>{p.active ? "Aktif" : "Nonaktif"}</Badge></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
