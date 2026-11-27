import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { emptyStageDone, overallPercent, stagesFor } from "@/lib/production";
import { fmtDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TabsNav } from "@/components/ui/tabs-nav";

export default async function SalesOrderListPage({ searchParams }: { searchParams: Promise<{ tampil?: string; akses?: string }> }) {
  const user = await requirePermission("sales-order");
  const { tampil, akses } = await searchParams;
  const all = tampil === "semua";
  const scope = user.companies.length > 0 ? { companyId: { in: user.companies.map((c) => c.id) } } : {};
  const rows = await db.productionOrder.findMany({
    where: { ...scope, ...(all ? {} : { project: { status: "BERJALAN" } }) },
    include: {
      order: { select: { id: true } },
      project: {
        select: {
          status: true, dueDate: true, kind: true, customer: { select: { name: true } },
          lines: { select: { qty: true, stages: true } },
        },
      },
      lines: { select: { id: true } },
    },
  });
  const list = rows.map((r) => {
    const lines = r.project.lines.map((l) => {
      const done = emptyStageDone();
      for (const s of l.stages) done[s.stage] = s.done;
      return { qty: l.qty, done };
    });
    return { r, units: lines.reduce((n, l) => n + l.qty, 0), pct: overallPercent(lines, stagesFor(r.project.kind)) };
  }).sort((a, b) => (a.r.project.dueDate?.getTime() ?? Infinity) - (b.r.project.dueDate?.getTime() ?? Infinity));

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sales Order</h1>
          <p className="text-sm text-muted-foreground">Acuan produksi dan packing. Terbit otomatis saat Konfirmasi Order dibuat.</p>
        </div>
        <TabsNav items={[
          { href: "/sales-order", label: "Berjalan", active: !all },
          { href: "/sales-order?tampil=semua", label: "Semua", active: all },
        ]} />
      </div>
      {akses === "ditolak" && <p role="alert" className="rounded-lg border border-border bg-muted p-3 text-sm">Anda tidak punya akses ke halaman tersebut.</p>}
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>No. SO</TH><TH>Pemesan</TH><TH>Tgl. kirim</TH><TH className="text-right">Barang</TH><TH>Progres</TH><TH>Status</TH></TR></THead>
            <TBody>
              {list.length === 0 && <TR><TD colSpan={6} className="py-10 text-center text-muted-foreground">{all ? "Belum ada Sales Order." : "Tidak ada Sales Order yang sedang berjalan."}</TD></TR>}
              {list.map(({ r, units, pct }) => (
                <TR key={r.id}>
                  <TD><Link href={`/sales-order/${r.id}`} className="font-medium hover:underline">{r.number}</Link></TD>
                  <TD>{r.project.customer?.name ?? "—"}</TD>
                  <TD className="whitespace-nowrap">{r.project.dueDate ? fmtDate(r.project.dueDate) : "—"}</TD>
                  <TD className="text-right tabular-nums">{r.lines.length} jenis · {units} unit</TD>
                  <TD className="min-w-32"><div className="flex items-center gap-2"><Progress value={pct} /><span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span></div></TD>
                  <TD><Badge variant="outline">{r.project.status === "BERJALAN" ? "Berjalan" : r.project.status === "SELESAI" ? "Selesai" : "Dibatalkan"}</Badge></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
