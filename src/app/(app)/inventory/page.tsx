import Link from "next/link";
import { Box } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MOVEMENT_LABEL, STATUS_LABEL, stockStatus, type MovementTypeName } from "@/lib/stock";
import { fmtDate, fmtQty, fmtSigned } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TabsNav } from "@/components/ui/tabs-nav";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; tersimpan?: string }>;
}) {
  const user = await requirePermission("inventory");
  const sp = await searchParams;
  const tab = sp.tab === "bahan" ? "bahan" : "jadi";
  const kind = tab === "bahan" ? "RAW" : "FINISHED";
  const q = sp.q?.trim() ?? "";
  const canEdit = can(user.role, "inventory", "edit");
  const canCreate = can(user.role, "inventory", "create");

  const [all, items, recent] = await Promise.all([
    db.item.findMany({ where: { kind, active: true }, select: { onHand: true, minStock: true, name: true } }),
    db.item.findMany({
      where: {
        kind, active: true,
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: { code: "asc" },
    }),
    db.stockMovement.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { item: { select: { name: true, unit: true } } } }),
  ]);

  const statuses = all.map((i) => ({ name: i.name, s: stockStatus(Number(i.onHand), Number(i.minStock)) }));
  const low = statuses.filter((s) => s.s === "MENIPIS").length;
  const out = statuses.filter((s) => s.s === "HABIS");
  const label = tab === "bahan" ? "bahan baku" : "barang jadi";
  const total = all.reduce((n, i) => n + Number(i.onHand), 0);

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stok</h1>
          <p className="text-sm text-muted-foreground">Satu gudang untuk GTF dan SBA</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <>
              <Button asChild variant="outline"><Link href="/inventory/mutasi/baru?jenis=PENYESUAIAN">Penyesuaian</Link></Button>
              <Button asChild variant="outline"><Link href="/inventory/mutasi/baru?jenis=KELUAR">Stok keluar</Link></Button>
              <Button asChild><Link href="/inventory/mutasi/baru?jenis=MASUK">+ Stok masuk</Link></Button>
            </>
          )}
        </div>
      </div>

      {sp.tersimpan && <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm">Mutasi stok tersimpan.</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title={`Jenis ${label}`} value={all.length} hint={`${fmtQty(total)} unit/satuan tersedia`} />
        <StatCard title="Menipis" value={low} hint="Di bawah stok minimum" />
        <StatCard title="Habis" value={out.length} hint={out.slice(0, 2).map((o) => o.name).join(", ") || "—"} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsNav
          items={[
            { href: "/inventory?tab=jadi", label: "Barang jadi", active: tab === "jadi" },
            { href: "/inventory?tab=bahan", label: "Bahan baku", active: tab === "bahan" },
          ]}
        />
        <div className="flex gap-2">
          <form className="w-72">
            <input type="hidden" name="tab" value={tab} />
            <Input name="q" defaultValue={q} placeholder="Cari nama atau kode barang…" aria-label="Cari barang" />
          </form>
          {canCreate && (
            <Button asChild variant="outline"><Link href={`/inventory/barang/baru?jenis=${kind}`}>+ Barang</Link></Button>
          )}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Kode</TH><TH>Nama barang</TH><TH>Satuan</TH>
                  <TH className="text-right">Stok</TH><TH className="text-right">Min.</TH><TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {items.length === 0 && (
                  <TR><TD colSpan={6} className="py-8 text-center text-muted-foreground">Belum ada {label}.</TD></TR>
                )}
                {items.map((i) => {
                  const s = stockStatus(Number(i.onHand), Number(i.minStock));
                  return (
                    <TR key={i.id}>
                      <TD className="whitespace-nowrap">{i.code}</TD>
                      <TD><Link href={`/inventory/barang/${i.id}`} className="hover:underline">{i.name}</Link></TD>
                      <TD>{i.unit}</TD>
                      <TD className="text-right tabular-nums">{fmtQty(Number(i.onHand))}</TD>
                      <TD className="text-right tabular-nums">{fmtQty(Number(i.minStock))}</TD>
                      <TD>
                        <Badge dot={s === "HABIS" ? "red" : s === "MENIPIS" ? "amber" : "green"}>
                          {STATUS_LABEL[s]}
                        </Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pergerakan terakhir</CardTitle>
            <p className="text-sm text-muted-foreground">Stok dihitung dari catatan ini</p>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col">
              {recent.length === 0 && <li className="text-sm text-muted-foreground">Belum ada mutasi.</li>}
              {recent.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{m.item.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {MOVEMENT_LABEL[m.type as MovementTypeName]} · {fmtDate(m.createdAt)}
                    </div>
                  </div>
                  <span className="font-medium tabular-nums">{fmtSigned(Number(m.qty))}</span>
                </li>
              ))}
            </ul>
            <Button asChild variant="ghost" size="sm" className="mt-2 w-full">
              <Link href="/inventory/mutasi">Lihat semua riwayat</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, hint }: { title: string; value: number; hint: string }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Box className="size-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
