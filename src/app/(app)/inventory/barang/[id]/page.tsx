import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getBom } from "@/lib/inventory";
import { MOVEMENT_LABEL, STATUS_LABEL, stockStatus, type MovementTypeName } from "@/lib/stock";
import { fmtDateTime, fmtQty, fmtSigned } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BomEditor } from "./bom-editor";
import { ItemForm } from "./item-form";

export default async function BarangPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("inventory");
  const { id } = await params;
  const item = await db.item.findUnique({ where: { id } });
  if (!item) notFound();
  const canEdit = can(user.role, "inventory", "edit");
  const [moves, bom, materials, usedIn] = await Promise.all([
    db.stockMovement.findMany({ where: { itemId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
    item.kind === "FINISHED" ? getBom(db, id) : Promise.resolve([]),
    item.kind === "FINISHED"
      ? db.item.findMany({ where: { kind: "RAW", active: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, unit: true } })
      : Promise.resolve([]),
    item.kind === "RAW"
      ? db.bomLine.findMany({ where: { materialId: id }, include: { product: { select: { id: true, code: true, name: true } } } })
      : Promise.resolve([]),
  ]);
  const onHand = Number(item.onHand);
  const s = stockStatus(onHand, Number(item.minStock));

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{item.name}</h1>
          <p className="text-sm text-muted-foreground">
            {item.kind === "RAW" ? "Bahan baku" : "Barang jadi"} · {item.code}{!item.active && " · Nonaktif"}
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold tabular-nums">{fmtQty(onHand)} <span className="text-base font-normal text-muted-foreground">{item.unit}</span></div>
          <Badge dot={s === "HABIS" ? "red" : s === "MENIPIS" ? "amber" : "green"}>{STATUS_LABEL[s]}</Badge>
        </div>
      </div>

      {canEdit && (
        <Card>
          <CardHeader><CardTitle>Data barang</CardTitle></CardHeader>
          <CardContent>
            <ItemForm item={{ id: item.id, name: item.name, unit: item.unit, minStock: Number(item.minStock), unitCost: Number(item.unitCost), notes: item.notes ?? "", active: item.active }} />
            <div className="mt-4 flex gap-2">
              <Button asChild variant="outline" size="sm"><Link href={`/inventory/mutasi/baru?barang=${item.id}`}>Catat mutasi</Link></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {item.kind === "FINISHED" && (
        <Card>
          <CardHeader>
            <CardTitle>BOM (bahan per 1 {item.unit})</CardTitle>
            <p className="text-sm text-muted-foreground">Dipakai untuk menghitung kebutuhan dan pemakaian bahan baku produksi.</p>
          </CardHeader>
          <CardContent>
            {canEdit ? (
              <BomEditor
                productId={item.id}
                materials={materials}
                initial={bom.map((l) => ({ materialId: l.materialId, qty: String(l.qty) }))}
              />
            ) : bom.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada BOM.</p>
            ) : (
              <ul className="text-sm">
                {bom.map((l) => <li key={l.id}>{l.material.code} — {l.material.name}: {fmtQty(l.qty)} {l.material.unit}</li>)}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {item.kind === "RAW" && usedIn.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Dipakai di BOM</CardTitle></CardHeader>
          <CardContent>
            <ul className="text-sm">
              {usedIn.map((l) => (
                <li key={l.id}>
                  <Link href={`/inventory/barang/${l.product.id}`} className="hover:underline">{l.product.code} — {l.product.name}</Link>
                  : {fmtQty(Number(l.qty))} {item.unit} per unit
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Riwayat mutasi</CardTitle>
          <p className="text-sm text-muted-foreground"><Link href={`/inventory/mutasi?barang=${item.id}`} className="hover:underline">Lihat semua</Link></p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>Waktu</TH><TH>Jenis</TH><TH className="text-right">Jumlah</TH><TH className="text-right">Saldo</TH><TH>Catatan</TH></TR></THead>
            <TBody>
              {moves.length === 0 && <TR><TD colSpan={5} className="py-6 text-center text-muted-foreground">Belum ada mutasi.</TD></TR>}
              {moves.map((m) => (
                <TR key={m.id}>
                  <TD className="whitespace-nowrap">{fmtDateTime(m.createdAt)}</TD>
                  <TD>{MOVEMENT_LABEL[m.type as MovementTypeName]}</TD>
                  <TD className="text-right font-medium tabular-nums">{fmtSigned(Number(m.qty))}</TD>
                  <TD className="text-right tabular-nums">{fmtQty(Number(m.balanceAfter))}</TD>
                  <TD className="text-muted-foreground">{m.note ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
