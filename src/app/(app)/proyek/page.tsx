import Link from "next/link";
import { Layers, PackageCheck, Truck, Pause, Search } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { projectScope } from "@/lib/project-scope";
import {
  aggregateStages, currentStage, type StageName, emptyStageDone, orderTotals, overallPercent, stagesFor, stageStatus, STAGE_LABEL, STAGES,
} from "@/lib/production";
import { daysUntil, fmtDate, fmtRp } from "@/lib/format";
import { paidOf } from "@/lib/documents";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TabsNav } from "@/components/ui/tabs-nav";

type SP = { tab?: string; pt?: string; q?: string };

export default async function ProyekPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("proyek");
  const sp = await searchParams;
  const tab = sp.tab === "stok" ? "stok" : sp.tab === "selesai" ? "selesai" : "berjalan";
  const q = sp.q?.trim() ?? "";
  const companies = await db.company.findMany({ where: { active: true }, orderBy: { code: "asc" }, select: { id: true, code: true } });
  const pt = companies.find((c) => c.code === sp.pt);
  const scope = projectScope(user);

  const load = (where: object) => db.project.findMany({
    where: { AND: [scope, where] },
    include: {
      company: { select: { code: true, ppnRate: true } }, customer: { select: { name: true } },
      lines: { orderBy: { sort: "asc" }, include: { product: { select: { name: true, unit: true } }, stages: true } },
      salesOrder: { select: { number: true } },
      invoices: { where: { status: "TERBIT" }, select: { total: true, dueDate: true, payments: { select: { amount: true, voidedAt: true } } } },
    },
  });
  const [running, listed] = await Promise.all([
    load({ status: "BERJALAN" }),
    load({
      ...(tab === "selesai" ? { status: "SELESAI" } : { status: "BERJALAN", kind: tab === "stok" ? "STOK" : "ORDER" }),
      ...(pt ? { companyId: pt.id } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { customer: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    }),
  ]);

  const shape = (p: (typeof running)[number]) => {
    const lines = p.lines.map((l) => {
      const done = emptyStageDone();
      for (const s of l.stages) done[s.stage] = s.done;
      return { qty: l.qty, unitPrice: Number(l.unitPrice), done, heldStages: l.stages.filter((s) => s.held && s.done < l.qty).map((s) => s.stage) };
    });
    const stages = stagesFor(p.kind);
    return {
      p, lines, stages,
      total: orderTotals(lines, Number(p.ppnRate)).total,
      pct: overallPercent(lines, stages),
      cur: currentStage(lines, stages),
      held: lines.some((l) => l.heldStages.length > 0),
      heldStage: lines.flatMap((l) => l.heldStages)[0] as StageName | undefined,
    };
  };
  const rs = running.map(shape);
  const orders = rs.filter((r) => r.p.kind === "ORDER");
  const soon = orders.filter((r) => r.p.dueDate && daysUntil(r.p.dueDate) <= 7).sort((a, b) => a.p.dueDate!.getTime() - b.p.dueDate!.getTime());
  const heldCount = rs.filter((r) => r.held).length;
  const heldFirst = rs.find((r) => r.held);
  const stockRuns = rs.filter((r) => r.p.kind === "STOK");

  // Status pembayaran per proyek pesanan, dari invoice terbit.
  const payOf = (p: (typeof running)[number]): { label: string; dot: "gray" | "black" | "green" | "amber" | "red" } | null => {
    if (p.kind !== "ORDER") return null;
    if (p.invoices.length === 0) return { label: "Belum ditagih", dot: "gray" };
    const open = p.invoices.filter((i) => paidOf(i.payments) < Number(i.total));
    if (open.length === 0) return { label: "Lunas", dot: "green" };
    if (open.some((i) => daysUntil(i.dueDate) < 0)) return { label: "Lewat jatuh tempo", dot: "red" };
    if (p.invoices.some((i) => paidOf(i.payments) > 0)) return { label: "Dibayar sebagian", dot: "amber" };
    return { label: "Menunggu bayar", dot: "black" };
  };
  const rows = listed.map(shape).sort((a, b) => (a.p.dueDate?.getTime() ?? Infinity) - (b.p.dueDate?.getTime() ?? Infinity));
  const showPay = can(user.role, "invoice", "view");
  const canOrder = can(user.role, "order", "create");
  const canInternal = can(user.role, "proyek", "create");
  const qs = (o: Partial<SP>) => {
    const m = { tab: tab === "berjalan" ? undefined : tab, pt: pt?.code, q: q || undefined, ...o };
    const s = new URLSearchParams(Object.entries(m).filter(([, v]) => v) as [string, string][]).toString();
    return `/proyek${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Proyek</h1>
          <p className="text-sm text-muted-foreground">Semua proyek yang sedang dikerjakan, diurutkan dari tanggal kirim terdekat</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canOrder && <Button asChild variant="outline"><Link href="/proyek/baru">+ Proyek</Link></Button>}
          {canInternal && <Button asChild><Link href="/proyek/baru?jenis=stok">+ Produksi internal</Link></Button>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Proyek berjalan" value={orders.length} hint={`Nilai order ${fmtRp(orders.reduce((n, r) => n + r.total, 0))}`} icon={<Layers className="size-4 text-muted-foreground" aria-hidden />} />
        <StatCard title="Kirim dalam 7 hari" value={soon.length} tone={soon.length ? "amber" : undefined} hint={soon[0] ? `${soon[0].p.customer?.name ?? soon[0].p.name}, ${fmtDate(soon[0].p.dueDate!)}` : "—"} icon={<Truck className="size-4 text-muted-foreground" aria-hidden />} />
        <StatCard title="Tahap tertahan" value={heldCount} tone={heldCount ? "amber" : undefined} hint={heldFirst ? `${heldFirst.heldStage ? `${STAGE_LABEL[heldFirst.heldStage]}, ` : ""}${heldFirst.p.code.replace(/\/.*$/, "")}` : "—"} icon={<Pause className="size-4 text-muted-foreground" aria-hidden />} />
        <StatCard title="Produksi stok" value={stockRuns.length} hint={stockRuns[0] ? `${stockRuns[0].p.name}${stockRuns[0].pct === 0 ? ", belum mulai" : ""}` : "—"} icon={<PackageCheck className="size-4 text-muted-foreground" aria-hidden />} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <TabsNav items={[
            { href: qs({ tab: undefined }), label: `Berjalan (${orders.length})`, active: tab === "berjalan" },
            { href: qs({ tab: "stok" }), label: `Produksi stok (${stockRuns.length})`, active: tab === "stok" },
            { href: qs({ tab: "selesai" }), label: "Selesai", active: tab === "selesai" },
          ]} />
          <TabsNav items={[
            { href: qs({ pt: undefined }), label: "Semua", active: !pt },
            ...companies.map((c) => ({ href: qs({ pt: c.code }), label: c.code, active: pt?.id === c.id })),
          ]} />
        </div>
        <form className="w-72">
          {tab !== "berjalan" && <input type="hidden" name="tab" value={tab} />}
          {pt && <input type="hidden" name="pt" value={pt.code} />}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={q} className="pl-9" placeholder="Cari proyek atau pelanggan…" aria-label="Cari proyek" />
          </div>
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR><TH>Proyek</TH><TH>Perusahaan</TH><TH>Tahap</TH><TH>Progres</TH><TH className="whitespace-nowrap">Est. kirim</TH>{showPay && <TH>Pembayaran</TH>}</TR>
            </THead>
            <TBody>
              {rows.length === 0 && <TR><TD colSpan={showPay ? 6 : 5} className="py-8 text-center text-muted-foreground">Tidak ada proyek.</TD></TR>}
              {rows.map(({ p, pct, cur, held }) => {
                const left = p.dueDate ? daysUntil(p.dueDate) : null;
                return (
                  <TR key={p.id}>
                    <TD>
                      <Link href={`/proyek/${p.id}`} className="font-medium hover:underline">{p.customer?.name ?? p.name}</Link>
                      <div className="text-xs text-muted-foreground">{p.salesOrder?.number ?? p.code} · {p.name}</div>
                    </TD>
                    <TD>
                      {p.company ? (
                        <Badge variant={Number(p.company.ppnRate) > 0 ? "default" : "outline"}>
                          {p.company.code} · {Number(p.company.ppnRate) > 0 ? `PPN ${Number(p.company.ppnRate)}%` : "Non-PPN"}
                        </Badge>
                      ) : <Badge variant="secondary">Stok internal</Badge>}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {p.status === "SELESAI" ? "Selesai" : cur ? STAGE_LABEL[cur] : "—"}
                      {held && <Badge dot="amber" className="ml-2">Tertahan</Badge>}
                    </TD>
                    <TD className="min-w-40">
                      <div className="flex items-center gap-2"><Progress value={pct} /><span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span></div>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {p.dueDate ? fmtDate(p.dueDate) : "—"}
                      {left !== null && p.status === "BERJALAN" && (
                        <div className={`text-xs ${left < 0 ? "text-destructive" : left <= 7 ? "text-warning" : "text-muted-foreground"}`}>{left < 0 ? `Lewat ${-left} hari` : left === 0 ? "Hari ini" : `${left} hari lagi`}</div>
                      )}
                    </TD>
                    {showPay && <TD className="whitespace-nowrap">{(() => { const pay = payOf(p); return pay ? <Badge dot={pay.dot}>{pay.label}</Badge> : <span className="text-muted-foreground">—</span>; })()}</TD>}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {tab !== "selesai" && rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Posisi tahapan semua proyek</CardTitle>
            <p className="text-sm text-muted-foreground">Jumlah selesai per tahap. Rangka besi dan potong kayu berjalan paralel.</p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Proyek</th>
                  {STAGES.map((s) => <th key={s} className="px-1 py-2 text-center font-medium">{STAGE_LABEL[s]}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, lines, stages }) => {
                  const { total, done } = aggregateStages(lines);
                  return (
                    <tr key={p.id} className="border-t border-border">
                      <td className="py-2 pr-3">
                        <Link href={`/proyek/${p.id}`} className="hover:underline">{p.customer?.name ?? p.name}</Link>
                        <div className="text-xs text-muted-foreground">{p.code} · {total} unit</div>
                      </td>
                      {STAGES.map((s) => {
                        if (!stages.includes(s)) return <td key={s} className="px-1 py-2 text-center text-muted-foreground">—</td>;
                        const st = stageStatus(done[s], total, lines.some((l) => l.heldStages.includes(s)));
                        return (
                          <td key={s} className="px-1 py-2">
                            <div className={`rounded-lg border bg-card p-2 text-left ${st === "TERTAHAN" ? "border-warning" : "border-border"}`}>
                              <div className={`font-semibold tabular-nums ${st === "BELUM" ? "text-muted-foreground" : ""}`}>{done[s]}/{total}</div>
                              <Progress value={total ? (done[s] / total) * 100 : 0} tone={st === "TERTAHAN" ? "amber" : "default"} className="my-1" />
                              <div className={`text-xs ${st === "TERTAHAN" ? "text-warning" : "text-muted-foreground"}`}>{st === "SELESAI" ? "Selesai" : st === "BERJALAN" ? "Berjalan" : st === "TERTAHAN" ? "Tertahan" : "Belum"}</div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
