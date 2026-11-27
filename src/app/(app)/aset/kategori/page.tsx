import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ASSET_TYPES, TYPE_LABEL, type AssetTypeName } from "@/lib/asset";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CategoryForm, NewCategoryForm } from "./category-forms";

export default async function KategoriAsetPage() {
  const user = await requirePermission("aset");
  const categories = await db.assetCategory.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }], include: { _count: { select: { assets: true } } } });
  const canCreate = can(user.role, "aset", "create");
  const canEdit = can(user.role, "aset", "edit");
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground"><Link href="/aset" className="hover:underline">Aset</Link> / Kategori</p>
        <h1 className="text-2xl font-semibold">Kategori aset</h1>
        <p className="text-sm text-muted-foreground">Umur manfaat di sini menjadi nilai bawaan saat aset baru dibuat; tiap aset tetap bisa berbeda.</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>Kategori</TH><TH>Jenis</TH><TH>Umur manfaat (bulan)</TH><TH>Aset</TH><TH>Aktif</TH>{canEdit && <TH />}</TR></THead>
            <TBody>
              {categories.length === 0 && <TR><TD colSpan={6} className="py-6 text-center text-muted-foreground">Belum ada kategori.</TD></TR>}
              {categories.map((c) => (
                <TR key={c.id}>
                  {canEdit ? <CategoryForm c={{ id: c.id, name: c.name, usefulLifeMonths: c.usefulLifeMonths, active: c.active }} typeLabel={TYPE_LABEL[c.type as AssetTypeName]} count={c._count.assets} /> : (
                    <>
                      <TD>{c.name}</TD><TD>{TYPE_LABEL[c.type as AssetTypeName]}</TD><TD>{c.usefulLifeMonths}</TD><TD>{c._count.assets}</TD><TD>{c.active ? "Ya" : "Tidak"}</TD>
                    </>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      {canCreate && (
        <Card>
          <CardHeader><CardTitle>Kategori baru</CardTitle></CardHeader>
          <CardContent><NewCategoryForm types={ASSET_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))} /></CardContent>
        </Card>
      )}
    </div>
  );
}
