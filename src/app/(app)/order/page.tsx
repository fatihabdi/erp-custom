import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { orderAmounts } from "@/lib/billing";
import { fmtDateLong, fmtRp } from "@/lib/format";
import { CompanyBadge } from "@/components/doc-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default async function OrderPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePermission("order");
  const q = (await searchParams).q?.trim() ?? "";
  const rows = await db.salesOrder.findMany({
    where: {
      ...(user.companies.length > 0 ? { companyId: { in: user.companies.map((c) => c.id) } } : {}),
      ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { project: { name: { contains: q, mode: "insensitive" } } }, { project: { customer: { name: { contains: q, mode: "insensitive" } } } }] } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 200,
    include: {
      company: { select: { code: true } }, quotation: { select: { number: true } },
      project: { include: { customer: { select: { name: true } }, lines: { select: { qty: true, unitPrice: true } } } },
    },
  });
  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Konfirmasi Order</h1>
          <p className="text-sm text-muted-foreground">Pesanan yang sudah dikonfirmasi; setiap KO terhubung ke satu proyek produksi</p>
        </div>
        {can(user.role, "order", "create") && <Button asChild><Link href="/order/baru">+ Konfirmasi Order</Link></Button>}
      </div>
      <form className="w-72"><Input name="q" defaultValue={q} placeholder="Cari nomor, proyek, pelanggan…" aria-label="Cari konfirmasi order" /></form>
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>Nomor KO</TH><TH>Pelanggan</TH><TH>Proyek</TH><TH>Tanggal</TH><TH className="text-right">Nilai</TH><TH>Status</TH></TR></THead>
            <TBody>
              {rows.length === 0 && <TR><TD colSpan={6} className="py-8 text-center text-muted-foreground">Belum ada Konfirmasi Order.</TD></TR>}
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/order/${r.id}`} className="font-medium hover:underline">{r.number}</Link>
                    {r.quotation && <div className="text-xs text-muted-foreground">Ref. {r.quotation.number}</div>}
                  </TD>
                  <TD>{r.project.customer?.name}<div className="mt-0.5"><CompanyBadge code={r.company.code} ppnRate={Number(r.project.ppnRate)} /></div></TD>
                  <TD><Link href={`/proyek/${r.project.id}`} className="hover:underline">{r.project.code}</Link></TD>
                  <TD className="whitespace-nowrap">{fmtDateLong(r.date)}</TD>
                  <TD className="text-right tabular-nums">{fmtRp(orderAmounts(r.project.lines.map((l) => ({ qty: l.qty, unitPrice: Number(l.unitPrice) })), Number(r.project.ppnRate)).total)}</TD>
                  <TD>{r.project.status === "BATAL" ? <Badge dot="red">Batal</Badge> : r.signedAt ? <Badge dot="green">Ditandatangani</Badge> : <Badge dot="gray">Menunggu TTD</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
