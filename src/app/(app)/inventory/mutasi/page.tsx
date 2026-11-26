import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { MOVEMENT_LABEL, type MovementTypeName } from "@/lib/stock";
import { fmtDateTime, fmtQty, fmtSigned } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

const TYPES = Object.keys(MOVEMENT_LABEL) as MovementTypeName[];

export default async function MutasiPage({
  searchParams,
}: {
  searchParams: Promise<{ jenis?: string; barang?: string }>;
}) {
  await requirePermission("inventory");
  const sp = await searchParams;
  const type = TYPES.find((t) => t === sp.jenis);
  const [rows, items] = await Promise.all([
    db.stockMovement.findMany({
      where: { ...(type ? { type } : {}), ...(sp.barang ? { itemId: sp.barang } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { item: { select: { code: true, name: true, unit: true } } },
    }),
    db.item.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  const users = await db.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))] } },
    select: { id: true, name: true },
  });
  const userName = new Map(users.map((u) => [u.id, u.name]));

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground"><Link href="/inventory" className="hover:underline">Stok</Link> / Riwayat</p>
        <h1 className="text-2xl font-semibold">Riwayat mutasi stok</h1>
      </div>
      <form className="flex flex-wrap gap-2">
        <Select name="jenis" defaultValue={type ?? ""} className="w-56" aria-label="Jenis mutasi">
          <option value="">Semua jenis</option>
          {TYPES.map((t) => <option key={t} value={t}>{MOVEMENT_LABEL[t]}</option>)}
        </Select>
        <Select name="barang" defaultValue={sp.barang ?? ""} className="w-64" aria-label="Barang">
          <option value="">Semua barang</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
        </Select>
        <Button type="submit" variant="outline">Terapkan</Button>
      </form>
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Waktu</TH><TH>Barang</TH><TH>Jenis</TH><TH className="text-right">Jumlah</TH>
                <TH className="text-right">Saldo</TH><TH>Catatan</TH><TH>Oleh</TH>
              </TR>
            </THead>
            <TBody>
              {rows.length === 0 && <TR><TD colSpan={7} className="py-8 text-center text-muted-foreground">Tidak ada mutasi.</TD></TR>}
              {rows.map((m) => (
                <TR key={m.id}>
                  <TD className="whitespace-nowrap">{fmtDateTime(m.createdAt)}</TD>
                  <TD>{m.item.code} — {m.item.name}</TD>
                  <TD>{MOVEMENT_LABEL[m.type as MovementTypeName]}</TD>
                  <TD className="text-right font-medium tabular-nums">{fmtSigned(Number(m.qty))} {m.item.unit}</TD>
                  <TD className="text-right tabular-nums">{fmtQty(Number(m.balanceAfter))}</TD>
                  <TD className="text-muted-foreground">{m.note ?? "—"}</TD>
                  <TD>{m.userId ? userName.get(m.userId) ?? "—" : "Sistem"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
