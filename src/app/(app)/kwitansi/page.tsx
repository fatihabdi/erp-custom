import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { METHOD_LABEL } from "@/lib/billing";
import { fmtDateLong, fmtRp } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default async function KwitansiPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePermission("kwitansi");
  const q = (await searchParams).q?.trim() ?? "";
  const rows = await db.payment.findMany({
    where: {
      invoice: user.companies.length > 0 ? { companyId: { in: user.companies.map((c) => c.id) } } : {},
      ...(q ? { OR: [{ receiptNumber: { contains: q, mode: "insensitive" } }, { invoice: { number: { contains: q, mode: "insensitive" } } }, { invoice: { project: { customer: { name: { contains: q, mode: "insensitive" } } } } }] } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 200,
    include: { invoice: { select: { id: true, number: true, project: { select: { customer: { select: { name: true } } } } } } },
  });
  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Kwitansi</h1>
        <p className="text-sm text-muted-foreground">Terbit otomatis setiap kali pembayaran dicatat di invoice</p>
      </div>
      <form className="w-72"><Input name="q" defaultValue={q} placeholder="Cari kwitansi, invoice, pelanggan…" aria-label="Cari kwitansi" /></form>
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>Kwitansi</TH><TH>Pelanggan</TH><TH>Invoice</TH><TH>Tanggal</TH><TH>Cara</TH><TH className="text-right">Jumlah</TH><TH /></TR></THead>
            <TBody>
              {rows.length === 0 && <TR><TD colSpan={7} className="py-8 text-center text-muted-foreground">Belum ada kwitansi.</TD></TR>}
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{r.receiptNumber}{r.voidedAt && <Badge variant="secondary" className="ml-2">Batal</Badge>}</TD>
                  <TD>{r.invoice.project.customer?.name}</TD>
                  <TD><Link href={`/invoice/${r.invoice.id}`} className="hover:underline">{r.invoice.number}</Link></TD>
                  <TD className="whitespace-nowrap">{fmtDateLong(r.date)}</TD>
                  <TD>{METHOD_LABEL[r.method]}</TD>
                  <TD className="text-right tabular-nums">{fmtRp(Number(r.amount))}</TD>
                  <TD className="text-right"><a className="text-sm underline" href={`/api/dokumen/kwitansi/${r.id}`} target="_blank" rel="noreferrer">PDF</a></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
