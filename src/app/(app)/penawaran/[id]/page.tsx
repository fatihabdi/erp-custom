import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { noteLines, orderAmounts, termAmounts, toRows } from "@/lib/billing";
import { QUOTATION_FLOW, QUOTATION_LABEL } from "@/lib/documents";
import { fmtDateLong, fmtNum, fmtRpFull, toDateInput } from "@/lib/format";
import { terbilangRupiah } from "@/lib/terbilang";
import { ActionForm } from "@/components/action-form";
import { CompanyBadge, CompanyWarning, missingCompanyFields, PdfLinks, QUOTE_TONE } from "@/components/doc-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { quotationStatusAction } from "../actions";
import { QuotationForm } from "../baru/quotation-form";

const ACTION_LABEL = { TERKIRIM: "Tandai terkirim", DISETUJUI: "Tandai disetujui", DITOLAK: "Tandai ditolak", DRAFT: "Kembalikan ke draf", BATAL: "Batalkan" } as const;

export default async function PenawaranDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ubah?: string }> }) {
  const user = await requirePermission("penawaran");
  const { id } = await params;
  const q = await db.quotation.findUnique({
    where: { id },
    include: { company: true, customer: true, lines: { orderBy: { sort: "asc" } }, terms: { orderBy: { seq: "asc" } }, order: { select: { id: true, number: true } } },
  });
  if (!q || (user.companies.length > 0 && !user.companies.some((c) => c.id === q.companyId))) notFound();
  const canEdit = can(user.role, "penawaran", "edit");
  const editing = canEdit && q.status === "DRAFT" && (await searchParams).ubah === "1";

  if (editing) {
    const products = await db.item.findMany({ where: { kind: "FINISHED", active: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, unit: true } });
    const customers = await db.customer.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
    return (
      <div className="flex max-w-6xl flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ubah penawaran</h1>
        </div>
        <QuotationForm
          companies={[{ id: q.company.id, code: q.company.code, name: q.company.name, ppnRate: Number(q.ppnRate) }]}
          customers={customers} products={products} defaultDate={toDateInput(q.date)}
          initial={{
            id: q.id, number: q.number, companyId: q.companyId, date: toDateInput(q.date), customerId: q.customerId, attn: q.attn ?? "",
            subject: q.subject, notes: q.notes ?? "",
            lines: q.lines.map((l) => ({ description: l.description, spec: l.spec ?? "", qty: String(l.qty), unit: l.unit, unitPrice: String(Number(l.unitPrice)), productId: l.productId ?? "" })),
            terms: toRows(q.terms.map((t) => ({ label: t.label, trigger: t.trigger, percent: Number(t.percent), dueDays: t.dueDays }))),
          }}
        />
      </div>
    );
  }

  const totals = orderAmounts(q.lines.map((l) => ({ qty: l.qty, unitPrice: Number(l.unitPrice) })), Number(q.ppnRate));
  const amounts = termAmounts(totals, q.terms.map((t) => Number(t.percent)));
  const logo = await db.companyLogo.findUnique({ where: { companyId: q.companyId }, select: { companyId: true } });
  const next = QUOTATION_FLOW[q.status].filter((s) => s !== "BATAL" || canEdit);
  const canConvert = !q.order && (q.status === "TERKIRIM" || q.status === "DISETUJUI") && can(user.role, "order", "create");

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{q.number}</h1>
            <CompanyBadge code={q.company.code} ppnRate={Number(q.ppnRate)} />
            <Badge dot={QUOTE_TONE[q.status]}>{QUOTATION_LABEL[q.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{q.customer.name} · {q.subject} · {fmtDateLong(q.date)}</p>
        </div>
        <PdfLinks kind="penawaran" id={q.id} />
      </div>

      <CompanyWarning companyCode={q.company.code} missing={missingCompanyFields(q.company, !!logo)} canEdit={can(user.role, "pengaturan", "edit")} />

      <div className="flex flex-wrap items-start gap-2">
        {canEdit && q.status === "DRAFT" && <Button asChild variant="outline"><Link href={`/penawaran/${q.id}?ubah=1`}>Ubah</Link></Button>}
        {canEdit && !q.order && next.map((to) => (
          <ActionForm key={to} action={quotationStatusAction} submit={ACTION_LABEL[to]} variant={to === "TERKIRIM" || to === "DISETUJUI" ? "default" : "outline"} className="flex flex-col"
            confirm={to === "BATAL" ? "Batalkan penawaran ini? Nomornya tetap tercatat." : undefined}>
            <input type="hidden" name="id" value={q.id} /><input type="hidden" name="to" value={to} />
          </ActionForm>
        ))}
        {canConvert && <Button asChild><Link href={`/order/baru?penawaran=${q.id}`}>Buat Konfirmasi Order</Link></Button>}
        {q.order && <Button asChild variant="outline"><Link href={`/order/${q.order.id}`}>Lihat KO {q.order.number}</Link></Button>}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>No</TH><TH>Uraian & spesifikasi</TH><TH className="text-right">Qty</TH><TH>Satuan</TH><TH className="text-right">Harga satuan</TH><TH className="text-right">Jumlah</TH></TR></THead>
            <TBody>
              {q.lines.map((l, i) => (
                <TR key={l.id}>
                  <TD>{i + 1}</TD>
                  <TD><div className="font-medium">{l.description}</div>{l.spec && <div className="text-xs text-muted-foreground">{l.spec}</div>}</TD>
                  <TD className="text-right tabular-nums">{l.qty}</TD><TD>{l.unit}</TD>
                  <TD className="text-right tabular-nums">{fmtNum(Number(l.unitPrice))}</TD>
                  <TD className="text-right tabular-nums">{fmtNum(l.qty * Number(l.unitPrice))}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <dl className="ml-auto grid w-72 gap-1 p-4 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Jumlah</dt><dd className="tabular-nums">{fmtRpFull(totals.subtotal)}</dd></div>
            {Number(q.ppnRate) > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">PPN {Number(q.ppnRate)}%</dt><dd className="tabular-nums">{fmtRpFull(totals.ppn)}</dd></div>}
            <div className="flex justify-between border-t border-border pt-1 font-semibold"><dt>Total</dt><dd className="tabular-nums">{fmtRpFull(totals.total)}</dd></div>
          </dl>
          <p className="border-t border-border p-4 text-sm"><span className="text-muted-foreground">Terbilang: </span><strong># {terbilangRupiah(totals.total)} #</strong></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Termin pembayaran</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>Termin</TH><TH>Pemicu</TH><TH className="text-right">%</TH><TH className="text-right">Nominal</TH></TR></THead>
            <TBody>
              {q.terms.map((t, i) => (
                <TR key={t.id}><TD>{t.label}</TD><TD>{t.trigger}</TD><TD className="text-right tabular-nums">{Number(t.percent)}</TD><TD className="text-right tabular-nums">{fmtNum(amounts[i].total)}</TD></TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {noteLines(q.notes).length > 0 && (
        <Card>
          <CardHeader><CardTitle>Catatan</CardTitle></CardHeader>
          <CardContent><ul className="list-disc pl-5 text-sm">{noteLines(q.notes).map((n, i) => <li key={i}>{n}</li>)}</ul></CardContent>
        </Card>
      )}
    </div>
  );
}
