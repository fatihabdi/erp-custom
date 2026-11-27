import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isOverdue, METHOD_LABEL, paymentState, sisaTagihan, termAmounts, orderAmounts, daysLate } from "@/lib/billing";
import { paidOf } from "@/lib/documents";
import { fmtDateLong, fmtNum, fmtRp, toDateInput } from "@/lib/format";
import { terbilangRupiah } from "@/lib/terbilang";
import { ActionForm } from "@/components/action-form";
import { CompanyBadge, CompanyWarning, missingCompanyFields, PdfLinks } from "@/components/doc-bits";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { recordPaymentAction, voidInvoiceAction, voidPaymentAction } from "../actions";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("invoice");
  const { id } = await params;
  const inv = await db.invoice.findUnique({
    where: { id },
    include: {
      company: true, term: true, payments: { orderBy: { createdAt: "asc" } },
      project: {
        include: {
          customer: true, salesOrder: { select: { id: true, number: true } }, terms: { orderBy: { seq: "asc" } },
          lines: { select: { qty: true, unitPrice: true } }, invoices: { where: { status: "TERBIT" }, select: { id: true, number: true, termId: true } },
        },
      },
    },
  });
  if (!inv || (user.companies.length > 0 && !user.companies.some((c) => c.id === inv.companyId))) notFound();
  const p = inv.project;
  const total = Number(inv.total);
  const paid = paidOf(inv.payments);
  const left = sisaTagihan(total, paid);
  const state = paymentState(total, paid);
  const overdue = inv.status === "TERBIT" && isOverdue(inv.dueDate, state);
  const logo = await db.companyLogo.findUnique({ where: { companyId: inv.companyId }, select: { companyId: true } });
  const order = orderAmounts(p.lines.map((l) => ({ qty: l.qty, unitPrice: Number(l.unitPrice) })), Number(p.ppnRate));
  const amounts = termAmounts(order, p.terms.map((t) => Number(t.percent)));
  const canPay = inv.status === "TERBIT" && left > 0 && can(user.role, "kwitansi", "create") && can(user.role, "invoice", "edit");
  const canVoid = inv.status === "TERBIT" && can(user.role, "invoice", "edit") && !inv.payments.some((x) => !x.voidedAt);
  const canSeeReceipts = can(user.role, "kwitansi", "view");

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{inv.number}</h1>
            <CompanyBadge code={inv.company.code} ppnRate={Number(inv.ppnRate)} />
            {inv.status === "BATAL" ? <Badge dot="gray">Dibatalkan</Badge> : (
              <>
                <Badge dot={state === "LUNAS" ? "green" : state === "SEBAGIAN" ? "amber" : "black"}>{state === "LUNAS" ? "Lunas" : state === "SEBAGIAN" ? "Dibayar sebagian" : "Menunggu bayar"}</Badge>
                {overdue && <Badge dot="red">Lewat tempo {daysLate(inv.dueDate)} hari</Badge>}
              </>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {p.customer?.name} · terbit {fmtDateLong(inv.date)} · jatuh tempo {fmtDateLong(inv.dueDate)}
            {p.salesOrder && <> · <Link href={`/order/${p.salesOrder.id}`} className="underline">{p.salesOrder.number}</Link></>}
          </p>
        </div>
        <PdfLinks kind="invoice" id={inv.id} />
      </div>

      <CompanyWarning companyCode={inv.company.code} missing={missingCompanyFields(inv.company, !!logo)} canEdit={can(user.role, "pengaturan", "edit")} />
      {inv.status === "BATAL" && <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">Dibatalkan: {inv.voidReason}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6 text-sm">
              <div><div className="font-medium">{inv.description}</div>{inv.detail && <div className="text-xs text-muted-foreground">{inv.detail}</div>}</div>
              <dl className="grid gap-1">
                <div className="flex justify-between"><dt className="text-muted-foreground">Nilai order · termin {Number(inv.percent)}%</dt><dd className="tabular-nums">{fmtRp(Number(inv.orderValue))}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Jumlah</dt><dd className="tabular-nums">{fmtRp(Number(inv.subtotal))}</dd></div>
                {Number(inv.ppnRate) > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">PPN {Number(inv.ppnRate)}%</dt><dd className="tabular-nums">{fmtRp(Number(inv.ppn))}</dd></div>}
                <div className="flex justify-between border-t border-border pt-1 font-semibold"><dt>Total tagihan</dt><dd className="tabular-nums">{fmtRp(total)}</dd></div>
              </dl>
              <p className="text-xs text-muted-foreground">Terbilang: # {terbilangRupiah(total)} #</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Posisi termin order</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead><TR><TH>Termin</TH><TH>Pemicu</TH><TH className="text-right">%</TH><TH className="text-right">Nominal</TH><TH>Invoice</TH></TR></THead>
                <TBody>
                  {p.terms.map((t, i) => {
                    const other = p.invoices.find((x) => x.termId === t.id);
                    return (
                      <TR key={t.id}>
                        <TD className={t.id === inv.termId ? "font-medium" : ""}>{t.label}{t.id === inv.termId && " (ini)"}</TD>
                        <TD>{t.trigger}</TD><TD className="text-right tabular-nums">{Number(t.percent)}</TD><TD className="text-right tabular-nums">{fmtNum(amounts[i].total)}</TD>
                        <TD>{other ? (other.id === inv.id ? "—" : <Link href={`/invoice/${other.id}`} className="hover:underline">{other.number}</Link>) : <span className="text-muted-foreground">Belum ditagih</span>}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Pembayaran</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead><TR><TH>Tanggal</TH><TH>Kwitansi</TH><TH>Cara</TH><TH className="text-right">Jumlah</TH><TH /></TR></THead>
                <TBody>
                  {inv.payments.length === 0 && <TR><TD colSpan={5} className="py-6 text-center text-muted-foreground">Belum ada pembayaran.</TD></TR>}
                  {inv.payments.map((x) => (
                    <TR key={x.id} className={x.voidedAt ? "text-muted-foreground line-through" : ""}>
                      <TD className="whitespace-nowrap">{fmtDateLong(x.date)}</TD>
                      <TD>{x.receiptNumber}{x.voidedAt && <span className="ml-2 text-xs no-underline">dibatalkan: {x.voidReason}</span>}</TD>
                      <TD>{METHOD_LABEL[x.method]}</TD>
                      <TD className="text-right tabular-nums">{fmtRp(Number(x.amount))}</TD>
                      <TD className="whitespace-nowrap text-right">
                        {canSeeReceipts && <a className="text-sm underline" href={`/api/dokumen/kwitansi/${x.id}`} target="_blank" rel="noreferrer">PDF</a>}
                        {!x.voidedAt && can(user.role, "kwitansi", "edit") && (
                          <details className="mt-1 text-left">
                            <summary className="cursor-pointer text-xs text-muted-foreground">Batalkan</summary>
                            <ActionForm action={voidPaymentAction} submit="Batalkan kwitansi" size="sm" variant="outline" className="mt-1 flex flex-col gap-2" confirm="Batalkan kwitansi ini? Pembayaran tidak lagi dihitung.">
                              <input type="hidden" name="paymentId" value={x.id} />
                              <Input name="reason" required placeholder="Alasan" aria-label="Alasan pembatalan" />
                            </ActionForm>
                          </details>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <aside className="flex h-fit flex-col gap-4">
          <Card>
            <CardHeader><CardTitle>Ringkasan</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Tagihan</span><span className="tabular-nums">{fmtRp(total)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Dibayar</span><span className="tabular-nums">{fmtRp(paid)}</span></div>
              <div className="flex justify-between border-t border-border pt-2 font-semibold"><span>Sisa</span><span className="tabular-nums">{fmtRp(left)}</span></div>
            </CardContent>
          </Card>

          {canPay && (
            <Card>
              <CardHeader><CardTitle>Catat pembayaran</CardTitle></CardHeader>
              <CardContent>
                <ActionForm action={recordPaymentAction} submit="Simpan & buat kwitansi" className="flex flex-col gap-3 [&>button]:w-full">
                  <input type="hidden" name="invoiceId" value={inv.id} />
                  <div className="flex flex-col gap-1.5"><Label htmlFor="date">Tanggal</Label><Input id="date" name="date" type="date" defaultValue={toDateInput(new Date())} required /></div>
                  <div className="flex flex-col gap-1.5"><Label htmlFor="amount">Jumlah (Rp)</Label><Input id="amount" name="amount" inputMode="decimal" defaultValue={String(left).replace(".", ",")} required /></div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="method">Metode</Label>
                    <Select id="method" name="method" defaultValue="TRANSFER">{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                  </div>
                  <div className="flex flex-col gap-1.5"><Label htmlFor="note">Catatan</Label><Input id="note" name="note" maxLength={300} placeholder="opsional" /></div>
                </ActionForm>
              </CardContent>
            </Card>
          )}

          {canVoid && (
            <details className="rounded-lg border border-border p-3 text-sm">
              <summary className="cursor-pointer font-medium">Batalkan invoice</summary>
              <ActionForm action={voidInvoiceAction} submit="Batalkan invoice" variant="outline" size="sm" className="mt-3 flex flex-col gap-2" confirm="Batalkan invoice ini? Nomornya tetap tercatat.">
                <input type="hidden" name="invoiceId" value={inv.id} />
                <Input name="reason" required placeholder="Alasan pembatalan" aria-label="Alasan pembatalan" />
              </ActionForm>
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}
