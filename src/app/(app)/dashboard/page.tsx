import Link from "next/link";
import { Box, FileText, Layers, Receipt } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { projectScope } from "@/lib/project-scope";
import { daysLate, isOverdue, orderAmounts, paymentState, sisaTagihan } from "@/lib/billing";
import { paidOf, QUOTATION_LABEL } from "@/lib/documents";
import { currentStage, emptyStageDone, overallPercent, stagesFor, STAGE_LABEL } from "@/lib/production";
import { stockStatus } from "@/lib/stock";
import { daysUntil, fmtDate, fmtDateLong, fmtQty, fmtRp } from "@/lib/format";
import { QUOTE_TONE } from "@/components/doc-bits";
import { Badge, type StatusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/stat-card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TabsNav } from "@/components/ui/tabs-nav";

const ICON = "size-4 text-muted-foreground";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ akses?: string; pt?: string }>;
}) {
  const user = await requirePermission("dashboard");
  const { akses, pt: ptCode } = await searchParams;
  const now = new Date();
  const mine = user.companies.length > 0 ? user.companies : null;
  const pt = (mine ?? await db.company.findMany({ where: { active: true }, select: { id: true, code: true } })).find((c) => c.code === ptCode);
  const companyWhere = pt ? { companyId: pt.id } : mine ? { companyId: { in: mine.map((c) => c.id) } } : {};
  const showTabs = !mine || mine.length > 1;
  const companies = mine ?? await db.company.findMany({ where: { active: true }, orderBy: { code: "asc" }, select: { id: true, code: true } });

  const seeQuotes = can(user.role, "penawaran", "view");
  const seeProjects = can(user.role, "proyek", "view");
  const seeInvoices = can(user.role, "invoice", "view");
  const seeStock = can(user.role, "inventory", "view");

  const [quotes, projects, invoices, finished] = await Promise.all([
    seeQuotes ? db.quotation.findMany({
      where: companyWhere, orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: { customer: { select: { name: true } }, lines: { select: { qty: true, unitPrice: true } } },
    }) : [],
    seeProjects ? db.project.findMany({
      where: { AND: [projectScope(user), { status: "BERJALAN", kind: "ORDER" }, companyWhere] },
      include: { customer: { select: { name: true } }, salesOrder: { select: { number: true } }, lines: { include: { stages: true } } },
    }) : [],
    seeInvoices ? db.invoice.findMany({
      where: { ...companyWhere, status: "TERBIT" }, include: { payments: true, project: { select: { customer: { select: { name: true } } } } },
    }) : [],
    seeStock ? db.item.findMany({ where: { kind: "FINISHED", active: true }, orderBy: { code: "asc" } }) : [],
  ]);

  const waiting = quotes.filter((q) => q.status === "TERKIRIM");
  const running = projects.map((p) => {
    const lines = p.lines.map((l) => {
      const done = emptyStageDone();
      for (const s of l.stages) done[s.stage] = s.done;
      return { qty: l.qty, unitPrice: Number(l.unitPrice), done, heldStages: l.stages.filter((s) => s.held && s.done < l.qty).map((s) => s.stage) };
    });
    const stages = stagesFor(p.kind);
    return { p, pct: overallPercent(lines, stages), cur: currentStage(lines, stages), held: lines.flatMap((l) => l.heldStages) };
  }).sort((a, b) => (a.p.dueDate?.getTime() ?? Infinity) - (b.p.dueDate?.getTime() ?? Infinity));
  const soon = running.filter((r) => r.p.dueDate && daysUntil(r.p.dueDate) <= 7).length;

  const bills = invoices.map((i) => {
    const total = Number(i.total);
    const state = paymentState(total, paidOf(i.payments));
    return { i, state, left: sisaTagihan(total, paidOf(i.payments)), overdue: isOverdue(i.dueDate, state, now) };
  }).filter((b) => b.state !== "LUNAS");
  const late = bills.filter((b) => b.overdue);

  const stock = finished.map((i) => ({ i, s: stockStatus(Number(i.onHand), Number(i.minStock)) }));
  const lowStock = stock.filter((x) => x.s !== "AMAN");
  const empty = lowStock.filter((x) => x.s === "HABIS");

  type Alert = { key: string; tone: StatusTone; title: string; hint: string; href: string };
  const alerts: Alert[] = [
    ...late.map((b): Alert => ({ key: `i${b.i.id}`, tone: "red", title: `Invoice ${b.i.number} lewat jatuh tempo`, hint: `${fmtRp(b.left)} · telat ${daysLate(b.i.dueDate, now)} hari`, href: `/invoice/${b.i.id}` })),
    ...running.filter((r) => r.held.length > 0).map((r): Alert => ({ key: `p${r.p.id}`, tone: "amber", title: `${STAGE_LABEL[r.held[0]]} tertahan`, hint: `${r.p.customer?.name ?? r.p.name} · ${r.p.salesOrder?.number ?? r.p.code}`, href: `/proyek/${r.p.id}` })),
    ...lowStock.map(({ i, s }): Alert => ({ key: `s${i.id}`, tone: s === "HABIS" ? "red" : "amber", title: `${i.name} ${s === "HABIS" ? "habis" : "menipis"}`, hint: `Stok ${fmtQty(Number(i.onHand))}, minimum ${fmtQty(Number(i.minStock))} ${i.unit}`, href: `/inventory/barang/${i.id}` })),
  ].slice(0, 6);

  const href = (code?: string) => `/dashboard${code ? `?pt=${code}` : ""}`;
  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Ringkasan per {fmtDateLong(now)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {showTabs && companies.length > 0 && (
            <TabsNav items={[{ href: href(), label: "Semua", active: !pt }, ...companies.map((c) => ({ href: href(c.code), label: c.code, active: pt?.id === c.id }))]} />
          )}
          {can(user.role, "penawaran", "create") && <Button asChild><Link href="/penawaran/baru">+ Buat Penawaran</Link></Button>}
        </div>
      </div>

      {akses === "ditolak" && (
        <p role="alert" className="rounded-lg border border-border bg-muted p-3 text-sm">Anda tidak punya akses ke halaman tersebut.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {seeQuotes && <StatCard title="Penawaran menunggu" value={waiting.length} hint="Menunggu jawaban pelanggan" icon={<FileText className={ICON} aria-hidden />} />}
        {seeProjects && <StatCard title="Proyek berjalan" value={running.length} hint={`${soon} kirim dalam 7 hari`} icon={<Layers className={ICON} aria-hidden />} />}
        {seeInvoices && <StatCard title="Piutang belum dibayar" value={fmtRp(bills.reduce((n, b) => n + b.left, 0))} icon={<Receipt className={ICON} aria-hidden />}
          hint={`${bills.length} invoice${late.length > 0 ? `, ${late.length} lewat jatuh tempo` : ""}`} tone={late.length > 0 ? "red" : undefined} />}
        {seeStock && <StatCard title="Stok perlu diisi" value={lowStock.length} icon={<Box className={ICON} aria-hidden />}
          hint={`${lowStock.length - empty.length} menipis, ${empty.length} habis`} tone={lowStock.length > 0 ? "amber" : undefined} />}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_20rem]">
        {seeProjects && (
          <Card>
            <CardHeader className="flex-row items-start justify-between">
              <div className="flex flex-col gap-1"><CardTitle>Proyek berjalan</CardTitle><p className="text-sm text-muted-foreground">Tahap dan estimasi pengiriman</p></div>
              <Button asChild variant="outline" size="sm"><Link href="/proyek">Lihat semua</Link></Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <THead><TR><TH>Proyek</TH><TH>Tahap saat ini</TH><TH>Progres</TH><TH>Est. kirim</TH></TR></THead>
                  <TBody>
                    {running.length === 0 && <TR><TD colSpan={4} className="py-8 text-center text-muted-foreground">Tidak ada proyek berjalan.</TD></TR>}
                    {running.slice(0, 4).map(({ p, pct, cur }) => (
                      <TR key={p.id}>
                        <TD>
                          <Link href={`/proyek/${p.id}`} className="hover:underline">{p.customer?.name ?? p.name}</Link>
                          <div className="text-xs text-muted-foreground">{p.salesOrder?.number ?? p.code}</div>
                        </TD>
                        <TD>{cur ? STAGE_LABEL[cur] : "—"}<div className="text-xs text-muted-foreground">Dikerjakan</div></TD>
                        <TD className="min-w-32"><div className="flex items-center gap-2"><Progress value={pct} /><span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span></div></TD>
                        <TD className="whitespace-nowrap">{p.dueDate ? fmtDate(p.dueDate) : "—"}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle>Perlu perhatian</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {alerts.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada yang perlu ditangani.</p>}
            {alerts.map((a) => (
              <Link key={a.key} href={a.href} className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/40">
                <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${a.tone === "red" ? "bg-destructive" : "bg-warning"}`} />
                <span className="min-w-0 text-sm leading-5">{a.title}<span className="block text-xs text-muted-foreground">{a.hint}</span></span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {seeQuotes && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Penawaran terbaru</CardTitle>
            <Button asChild variant="outline" size="sm"><Link href="/penawaran">Lihat semua</Link></Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <THead><TR><TH>No. Penawaran</TH><TH>Pelanggan</TH><TH className="text-right">Total</TH><TH>Status</TH></TR></THead>
                <TBody>
                  {quotes.length === 0 && <TR><TD colSpan={4} className="py-8 text-center text-muted-foreground">Belum ada penawaran.</TD></TR>}
                  {quotes.slice(0, 4).map((q) => (
                    <TR key={q.id}>
                      <TD><Link href={`/penawaran/${q.id}`} className="hover:underline">{q.number}</Link></TD>
                      <TD>{q.customer.name}</TD>
                      <TD className="text-right tabular-nums">{fmtRp(orderAmounts(q.lines.map((l) => ({ qty: l.qty, unitPrice: Number(l.unitPrice) })), Number(q.ppnRate)).total)}</TD>
                      <TD><Badge dot={QUOTE_TONE[q.status]}>{QUOTATION_LABEL[q.status]}</Badge></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
