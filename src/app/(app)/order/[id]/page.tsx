import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isOverdue, noteLines, orderAmounts, paymentState, termAmounts, toRows } from "@/lib/billing";
import { paidOf } from "@/lib/documents";
import { fmtDateLong, fmtNum, fmtRpFull, toDateInput } from "@/lib/format";
import { terbilangRupiah } from "@/lib/terbilang";
import { ActionForm } from "@/components/action-form";
import { CompanyBadge, CompanyWarning, missingCompanyFields, PdfLinks } from "@/components/doc-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { signOrderAction, updateOrderAction } from "../actions";
import { TermsForm } from "./terms-form";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("order");
  const { id } = await params;
  const o = await db.salesOrder.findUnique({
    where: { id },
    include: {
      company: true, quotation: { select: { id: true, number: true } },
      project: {
        include: {
          customer: true, terms: { orderBy: { seq: "asc" } },
          lines: { orderBy: { sort: "asc" }, include: { product: { select: { name: true, unit: true } } } },
          invoices: { where: { status: "TERBIT" }, include: { payments: true } },
        },
      },
    },
  });
  if (!o || (user.companies.length > 0 && !user.companies.some((c) => c.id === o.companyId))) notFound();
  const p = o.project;
  const canEdit = can(user.role, "order", "edit") && p.status !== "BATAL";
  const ppn = Number(p.ppnRate);
  const totals = orderAmounts(p.lines.map((l) => ({ qty: l.qty, unitPrice: Number(l.unitPrice) })), ppn);
  const amounts = termAmounts(totals, p.terms.map((t) => Number(t.percent)));
  const logo = await db.companyLogo.findUnique({ where: { companyId: o.companyId }, select: { companyId: true } });
  const canInvoice = can(user.role, "invoice", "create");
  const termsLocked = p.invoices.length > 0;
  const paidTotal = p.invoices.reduce((n, i) => n + paidOf(i.payments), 0);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{o.number}</h1>
            <CompanyBadge code={o.company.code} ppnRate={ppn} />
            {o.signedAt ? <Badge>Ditandatangani {fmtDateLong(o.signedAt)}</Badge> : <Badge variant="outline">Menunggu tanda tangan pemesan</Badge>}
            {p.status === "BATAL" && <Badge variant="secondary">Proyek dibatalkan</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {p.customer?.name} · {fmtDateLong(o.date)} · proyek <Link href={`/proyek/${p.id}`} className="underline">{p.code}</Link>
            {o.quotation && <> · dari penawaran <Link href={`/penawaran/${o.quotation.id}`} className="underline">{o.quotation.number}</Link></>}
          </p>
        </div>
        <PdfLinks kind="konfirmasi-order" id={o.id} />
      </div>

      <CompanyWarning companyCode={o.company.code} missing={missingCompanyFields(o.company, !!logo)} canEdit={can(user.role, "pengaturan", "edit")} />

      {canEdit && (
        <ActionForm action={signOrderAction} submit={o.signedAt ? "Batalkan tanda tangan" : "Tandai sudah ditandatangani"} variant={o.signedAt ? "outline" : "default"}>
          <input type="hidden" name="id" value={o.id} /><input type="hidden" name="signed" value={o.signedAt ? "0" : "1"} />
        </ActionForm>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>No</TH><TH>Uraian</TH><TH className="text-right">Qty</TH><TH>Satuan</TH><TH className="text-right">Harga satuan</TH><TH className="text-right">Jumlah</TH></TR></THead>
            <TBody>
              {p.lines.map((l, i) => (
                <TR key={l.id}>
                  <TD>{i + 1}</TD><TD className="font-medium">{l.product.name}</TD>
                  <TD className="text-right tabular-nums">{l.qty}</TD><TD>{l.product.unit}</TD>
                  <TD className="text-right tabular-nums">{fmtNum(Number(l.unitPrice))}</TD>
                  <TD className="text-right tabular-nums">{fmtNum(l.qty * Number(l.unitPrice))}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <dl className="ml-auto grid w-72 gap-1 p-4 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Jumlah</dt><dd className="tabular-nums">{fmtRpFull(totals.subtotal)}</dd></div>
            {ppn > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">PPN {ppn}%</dt><dd className="tabular-nums">{fmtRpFull(totals.ppn)}</dd></div>}
            <div className="flex justify-between border-t border-border pt-1 font-semibold"><dt>Total</dt><dd className="tabular-nums">{fmtRpFull(totals.total)}</dd></div>
          </dl>
          <p className="border-t border-border p-4 text-sm"><span className="text-muted-foreground">Terbilang: </span><strong># {terbilangRupiah(totals.total)} #</strong></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Termin pembayaran</CardTitle>
          <p className="text-sm text-muted-foreground">Dibayar {fmtRpFull(paidTotal)} dari {fmtRpFull(totals.total)}. Satu invoice per termin, pembayaran boleh sebagian.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-0">
          <Table>
            <THead><TR><TH>Termin</TH><TH>Pemicu</TH><TH className="text-right">%</TH><TH className="text-right">Nominal</TH><TH>Invoice</TH></TR></THead>
            <TBody>
              {p.terms.map((t, i) => {
                const inv = p.invoices.find((x) => x.termId === t.id);
                const paid = inv ? paidOf(inv.payments) : 0;
                const st = inv ? paymentState(Number(inv.total), paid) : null;
                return (
                  <TR key={t.id}>
                    <TD className="font-medium">{t.label}</TD><TD>{t.trigger}</TD>
                    <TD className="text-right tabular-nums">{Number(t.percent)}</TD><TD className="text-right tabular-nums">{fmtNum(amounts[i].total)}</TD>
                    <TD>
                      {inv ? (
                        <Link href={`/invoice/${inv.id}`} className="hover:underline">
                          {inv.number} <Badge variant={st === "LUNAS" ? "default" : "outline"} className="ml-1">{st === "LUNAS" ? "Lunas" : st === "SEBAGIAN" ? "Sebagian" : isOverdue(inv.dueDate, st!) ? "Lewat tempo" : "Belum bayar"}</Badge>
                        </Link>
                      ) : canInvoice && p.status !== "BATAL"
                        ? <Button asChild size="sm" variant="outline"><Link href={`/invoice/baru?proyek=${p.id}&termin=${t.id}`}>Buat invoice</Link></Button>
                        : <span className="text-muted-foreground">Belum ditagih</span>}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {canEdit && (
            <details className="border-t border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">Ubah termin</summary>
              <div className="mt-3">
                {termsLocked
                  ? <p className="text-sm text-muted-foreground">Termin terkunci karena sudah ada invoice yang terbit. Batalkan invoice lebih dulu bila skema harus diganti.</p>
                  : <TermsForm id={o.id} order={totals} initial={toRows(p.terms.map((t) => ({ label: t.label, trigger: t.trigger, percent: Number(t.percent), dueDays: t.dueDays })))} />}
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Rincian KO</CardTitle></CardHeader>
        <CardContent>
          {canEdit ? (
            <ActionForm action={updateOrderAction} submit="Simpan" className="grid gap-4 sm:grid-cols-3">
              <input type="hidden" name="id" value={o.id} />
              <div className="flex flex-col gap-1.5"><Label htmlFor="dueDate">Estimasi pengiriman</Label><Input id="dueDate" name="dueDate" type="date" defaultValue={toDateInput(p.dueDate)} /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="workDays">Waktu pengerjaan (hari kerja)</Label><Input id="workDays" name="workDays" inputMode="numeric" defaultValue={o.workDays ?? ""} /></div>
              <div className="flex flex-col gap-1.5 sm:col-span-1"><Label htmlFor="deliveryLocation">Lokasi kirim</Label><Input id="deliveryLocation" name="deliveryLocation" defaultValue={o.deliveryLocation ?? ""} maxLength={300} /></div>
              <div className="flex flex-col gap-1.5 sm:col-span-3"><Label htmlFor="notes">Catatan (satu per baris)</Label><Textarea id="notes" name="notes" defaultValue={o.notes ?? ""} maxLength={1000} /></div>
            </ActionForm>
          ) : (
            <dl className="grid gap-2 text-sm">
              <div><dt className="text-muted-foreground">Estimasi pengiriman</dt><dd>{p.dueDate ? fmtDateLong(p.dueDate) : "—"}</dd></div>
              <div><dt className="text-muted-foreground">Waktu pengerjaan</dt><dd>{o.workDays ? `${o.workDays} hari kerja` : "—"}</dd></div>
              <div><dt className="text-muted-foreground">Lokasi kirim</dt><dd>{o.deliveryLocation ?? "—"}</dd></div>
              {noteLines(o.notes).length > 0 && <div><dt className="text-muted-foreground">Catatan</dt><dd><ul className="list-disc pl-5">{noteLines(o.notes).map((n, i) => <li key={i}>{n}</li>)}</ul></dd></div>}
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
