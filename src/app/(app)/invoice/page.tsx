import Link from "next/link";
import { FileText, Banknote } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { daysLate, isOverdue, paymentState, sisaTagihan } from "@/lib/billing";
import { wibParts } from "@/lib/doc-number";
import { paidOf } from "@/lib/documents";
import { fmtDate, fmtRp } from "@/lib/format";
import { CompanyBadge } from "@/components/doc-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TabsNav } from "@/components/ui/tabs-nav";

type SP = { tab?: string; q?: string };
const TABS = [["", "Semua"], ["belum", "Belum bayar"], ["sebagian", "Sebagian"], ["lunas", "Lunas"]] as const;

export default async function InvoicePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("invoice");
  const sp = await searchParams;
  const tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? "";
  const q = sp.q?.trim() ?? "";
  const scope = user.companies.length > 0 ? { companyId: { in: user.companies.map((c) => c.id) } } : {};

  const now = new Date();
  const { year, month } = wibParts(now);
  const monthStart = new Date(Date.UTC(year, month - 1, 1) - 7 * 3600_000);
  const [all, receipts] = await Promise.all([
    db.invoice.findMany({
      where: { ...scope, status: "TERBIT" }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 500,
      include: { payments: true, company: { select: { code: true } }, term: { select: { label: true } }, project: { select: { customer: { select: { name: true } } } } },
    }),
    can(user.role, "kwitansi", "view")
      ? db.payment.findMany({ where: { voidedAt: null, date: { gte: monthStart }, invoice: scope }, select: { amount: true } })
      : Promise.resolve(null),
  ]);
  const rows = all.map((i) => {
    const total = Number(i.total);
    const paid = paidOf(i.payments);
    const state = paymentState(total, paid);
    return { i, total, paid, state, left: sisaTagihan(total, paid), overdue: isOverdue(i.dueDate, state, now) };
  });
  const open = rows.filter((r) => r.state !== "LUNAS");
  const late = open.filter((r) => r.overdue);
  const lateMax = late.reduce((m, r) => Math.max(m, daysLate(r.i.dueDate, now)), 0);
  const received = receipts?.reduce((n, p) => n + Number(p.amount), 0) ?? 0;

  const shown = rows.filter((r) =>
    (tab === "" || (tab === "belum" && r.state === "BELUM") || (tab === "sebagian" && r.state === "SEBAGIAN") || (tab === "lunas" && r.state === "LUNAS")) &&
    (!q || `${r.i.number} ${r.i.project.customer?.name ?? ""} ${r.i.description}`.toLowerCase().includes(q.toLowerCase())));
  const href = (t: string) => {
    const s = new URLSearchParams(Object.entries({ tab: t, q }).filter(([, v]) => v) as [string, string][]).toString();
    return `/invoice${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoice & pembayaran</h1>
          <p className="text-sm text-muted-foreground">Satu invoice per termin, pembayaran boleh sebagian</p>
        </div>
        {can(user.role, "invoice", "create") && <Button asChild><Link href="/invoice/baru">+ Buat invoice</Link></Button>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Total piutang</CardTitle><FileText className="size-4 text-muted-foreground" aria-hidden /></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums">{fmtRp(open.reduce((n, r) => n + r.left, 0))}</div><p className="mt-1 text-xs text-muted-foreground">{open.length} invoice belum lunas</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Lewat jatuh tempo</CardTitle><FileText className="size-4 text-muted-foreground" aria-hidden /></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums">{fmtRp(late.reduce((n, r) => n + r.left, 0))}</div><p className="mt-1 text-xs text-muted-foreground">{late.length === 0 ? "Tidak ada" : `${late.length} invoice, terlambat sampai ${lateMax} hari`}</p></CardContent>
        </Card>
        {receipts && (
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Diterima bulan ini</CardTitle><Banknote className="size-4 text-muted-foreground" aria-hidden /></CardHeader>
            <CardContent><div className="text-2xl font-bold tabular-nums">{fmtRp(received)}</div><p className="mt-1 text-xs text-muted-foreground">{receipts.length} kwitansi</p></CardContent>
          </Card>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsNav items={TABS.map(([k, label]) => ({ href: href(k), label, active: tab === k }))} />
        <form className="w-72">
          {tab && <input type="hidden" name="tab" value={tab} />}
          <Input name="q" defaultValue={q} placeholder="Cari nomor, pelanggan…" aria-label="Cari invoice" />
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>Invoice</TH><TH>Termin</TH><TH>Tempo</TH><TH className="text-right">Nominal</TH><TH className="text-right">Sisa</TH><TH>Status</TH></TR></THead>
            <TBody>
              {shown.length === 0 && <TR><TD colSpan={6} className="py-8 text-center text-muted-foreground">Tidak ada invoice.</TD></TR>}
              {shown.map(({ i, total, state, left, overdue }) => (
                <TR key={i.id}>
                  <TD>
                    <Link href={`/invoice/${i.id}`} className="font-medium hover:underline">{i.number}</Link>
                    <div className="text-xs text-muted-foreground">{i.project.customer?.name} <CompanyBadge code={i.company.code} ppnRate={Number(i.ppnRate)} /></div>
                  </TD>
                  <TD className="whitespace-nowrap">{i.term?.label ?? "—"} {Number(i.percent)}%</TD>
                  <TD className="whitespace-nowrap">{fmtDate(i.dueDate)}</TD>
                  <TD className="text-right tabular-nums">{fmtRp(total)}</TD>
                  <TD className="text-right tabular-nums">{fmtRp(left)}</TD>
                  <TD className="whitespace-nowrap">
                    {overdue
                      ? <Badge dot="red">Lewat jatuh tempo</Badge>
                      : <Badge dot={state === "LUNAS" ? "green" : state === "SEBAGIAN" ? "amber" : "black"}>{state === "LUNAS" ? "Lunas" : state === "SEBAGIAN" ? "Dibayar sebagian" : "Menunggu bayar"}</Badge>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
