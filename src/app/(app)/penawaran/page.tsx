import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { orderAmounts } from "@/lib/billing";
import { QUOTATION_LABEL } from "@/lib/documents";
import { fmtDateLong, fmtRp } from "@/lib/format";
import { CompanyBadge, QUOTE_TONE } from "@/components/doc-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TabsNav } from "@/components/ui/tabs-nav";

type SP = { tab?: string; q?: string };
const TABS = [["", "Semua"], ["DRAFT", "Draf"], ["TERKIRIM", "Terkirim"], ["DISETUJUI", "Disetujui"], ["DITOLAK", "Ditolak"]] as const;

export default async function PenawaranPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("penawaran");
  const sp = await searchParams;
  const tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? "";
  const q = sp.q?.trim() ?? "";
  const rows = await db.quotation.findMany({
    where: {
      ...(user.companies.length > 0 ? { companyId: { in: user.companies.map((c) => c.id) } } : {}),
      ...(tab ? { status: tab } : {}),
      ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }, { customer: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: { company: { select: { code: true } }, customer: { select: { name: true } }, lines: { select: { qty: true, unitPrice: true } }, order: { select: { id: true } } },
  });
  const href = (t: string) => {
    const s = new URLSearchParams(Object.entries({ tab: t, q }).filter(([, v]) => v) as [string, string][]).toString();
    return `/penawaran${s ? `?${s}` : ""}`;
  };
  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Penawaran</h1>
          <p className="text-sm text-muted-foreground">Surat penawaran harga (SPH) untuk pelanggan, dari draf sampai disetujui</p>
        </div>
        {can(user.role, "penawaran", "create") && <Button asChild><Link href="/penawaran/baru">+ Penawaran</Link></Button>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsNav items={TABS.map(([k, label]) => ({ href: href(k), label, active: tab === k }))} />
        <form className="w-72">
          {tab && <input type="hidden" name="tab" value={tab} />}
          <Input name="q" defaultValue={q} placeholder="Cari nomor, perihal, pelanggan…" aria-label="Cari penawaran" />
        </form>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>Nomor</TH><TH>Pelanggan</TH><TH>Tanggal</TH><TH className="text-right">Total</TH><TH>Status</TH></TR></THead>
            <TBody>
              {rows.length === 0 && <TR><TD colSpan={5} className="py-8 text-center text-muted-foreground">Belum ada penawaran.</TD></TR>}
              {rows.map((r) => {
                const total = orderAmounts(r.lines.map((l) => ({ qty: l.qty, unitPrice: Number(l.unitPrice) })), Number(r.ppnRate)).total;
                return (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/penawaran/${r.id}`} className="font-medium hover:underline">{r.number}</Link>
                      <div className="text-xs text-muted-foreground">{r.subject}</div>
                    </TD>
                    <TD>{r.customer.name}<div className="mt-0.5"><CompanyBadge code={r.company.code} ppnRate={Number(r.ppnRate)} /></div></TD>
                    <TD className="whitespace-nowrap">{fmtDateLong(r.date)}</TD>
                    <TD className="text-right tabular-nums">{fmtRp(total)}</TD>
                    <TD><Badge dot={QUOTE_TONE[r.status]}>{QUOTATION_LABEL[r.status]}</Badge>{r.order && <span className="ml-2 text-xs text-muted-foreground">sudah KO</span>}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
