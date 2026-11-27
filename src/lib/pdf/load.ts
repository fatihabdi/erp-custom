import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { METHOD_LABEL, noteLines, orderAmounts, paymentPurpose, termAmounts } from "@/lib/billing";
import { fmtDateFull } from "@/lib/format";
import type { InvoicePdf, OrderPdf, PdfCompany, QuotationPdf, ReceiptPdf } from "./types";

export type DocKind = "penawaran" | "konfirmasi-order" | "invoice" | "kwitansi";
export type CompanyScope = { id: string }[];

const num = (d: Prisma.Decimal | number) => Number(d);
const inScope = (scope: CompanyScope, companyId: string) => scope.length === 0 || scope.some((c) => c.id === companyId);

async function pdfCompany(id: string): Promise<PdfCompany> {
  const [c, logo] = await Promise.all([db.company.findUniqueOrThrow({ where: { id } }), db.companyLogo.findUnique({ where: { companyId: id } })]);
  return {
    code: c.code, name: c.name, address: c.address, city: c.city, phone: c.phone, email: c.email,
    bankName: c.bankName, bankAccount: c.bankAccount, bankHolder: c.bankHolder,
    signatoryName: c.signatoryName, signatoryTitle: c.signatoryTitle, logo: logo ? Buffer.from(logo.data) : null,
  };
}

const safeName = (n: string) => n.replace(/[^A-Za-z0-9.-]+/g, "_");

export async function loadQuotationPdf(id: string, scope: CompanyScope): Promise<{ data: QuotationPdf; filename: string } | null> {
  const q = await db.quotation.findUnique({
    where: { id }, include: { customer: true, lines: { orderBy: { sort: "asc" } }, terms: { orderBy: { seq: "asc" } } },
  });
  if (!q || !inScope(scope, q.companyId)) return null;
  const items = q.lines.map((l) => ({
    description: l.description, spec: l.spec, qty: l.qty, unit: l.unit, unitPrice: num(l.unitPrice), amount: l.qty * num(l.unitPrice),
  }));
  const totals = orderAmounts(q.lines.map((l) => ({ qty: l.qty, unitPrice: num(l.unitPrice) })), num(q.ppnRate));
  const amounts = termAmounts(totals, q.terms.map((t) => num(t.percent)));
  return {
    filename: `Penawaran-${safeName(q.number)}.pdf`,
    data: {
      company: await pdfCompany(q.companyId), number: q.number, date: q.date,
      to: { name: q.customer.name, attn: q.attn, address: q.customer.address },
      subject: q.subject, items, totals: { ...totals, ppnRate: num(q.ppnRate) },
      terms: q.terms.map((t, i) => ({ label: t.label, trigger: t.trigger, percent: num(t.percent), amount: amounts[i].total })),
      notes: noteLines(q.notes), voided: q.status === "BATAL",
    },
  };
}

export async function loadOrderPdf(id: string, scope: CompanyScope): Promise<{ data: OrderPdf; filename: string } | null> {
  const o = await db.salesOrder.findUnique({
    where: { id },
    include: {
      quotation: { select: { number: true } },
      project: {
        include: {
          customer: true, terms: { orderBy: { seq: "asc" } },
          lines: { orderBy: { sort: "asc" }, include: { product: { select: { name: true, unit: true } } } },
        },
      },
    },
  });
  if (!o || !inScope(scope, o.companyId) || !o.project.customer) return null;
  const p = o.project;
  const items = p.lines.map((l) => ({
    description: l.product.name, spec: l.note, qty: l.qty, unit: l.product.unit, unitPrice: num(l.unitPrice), amount: l.qty * num(l.unitPrice),
  }));
  const totals = orderAmounts(p.lines.map((l) => ({ qty: l.qty, unitPrice: num(l.unitPrice) })), num(p.ppnRate));
  const amounts = termAmounts(totals, p.terms.map((t) => num(t.percent)));
  return {
    filename: `KO-${safeName(o.number)}.pdf`,
    data: {
      company: await pdfCompany(o.companyId), number: o.number, date: o.date, quotationNumber: o.quotation?.number ?? null,
      customer: { name: p.customer!.name, attn: p.customer!.contact, address: p.customer!.address },
      dueDate: p.dueDate, workDays: o.workDays, deliveryLocation: o.deliveryLocation,
      items, totals: { ...totals, ppnRate: num(p.ppnRate) },
      terms: p.terms.map((t, i) => ({ label: t.label, trigger: t.trigger, percent: num(t.percent), amount: amounts[i].total })),
      notes: noteLines(o.notes), cancelled: p.status === "BATAL",
    },
  };
}

export async function loadInvoicePdf(id: string, scope: CompanyScope): Promise<{ data: InvoicePdf; filename: string } | null> {
  const inv = await db.invoice.findUnique({
    where: { id },
    include: {
      payments: true,
      project: {
        include: {
          customer: true, salesOrder: { select: { number: true } }, terms: { orderBy: { seq: "asc" } },
          lines: { select: { qty: true, unitPrice: true } },
          invoices: { where: { status: "TERBIT" }, select: { id: true, number: true, termId: true } },
        },
      },
    },
  });
  if (!inv || !inScope(scope, inv.companyId) || !inv.project.customer) return null;
  const p = inv.project;
  const order = orderAmounts(p.lines.map((l) => ({ qty: l.qty, unitPrice: num(l.unitPrice) })), num(p.ppnRate));
  const amounts = termAmounts(order, p.terms.map((t) => num(t.percent)));
  const paid = inv.payments.filter((x) => !x.voidedAt).reduce((n, x) => n + Math.round(num(x.amount) * 100), 0) / 100;
  return {
    filename: `Invoice-${safeName(inv.number)}.pdf`,
    data: {
      company: await pdfCompany(inv.companyId), number: inv.number, date: inv.date, dueDate: inv.dueDate,
      orderNumber: p.salesOrder?.number ?? null,
      customer: { name: p.customer!.name, attn: p.customer!.contact, address: p.customer!.address },
      description: inv.description, detail: inv.detail, orderValue: num(inv.orderValue), percent: num(inv.percent),
      totals: { subtotal: num(inv.subtotal), ppnRate: num(inv.ppnRate), ppn: num(inv.ppn), total: num(inv.total) },
      paid,
      terms: p.terms.map((t, i) => {
        const other = p.invoices.find((x) => x.termId === t.id && x.id !== inv.id);
        return {
          label: t.label, trigger: t.trigger, percent: num(t.percent), amount: amounts[i].total, current: t.id === inv.termId,
          note: t.id === inv.termId ? `Jatuh tempo ${fmtDateFull(inv.dueDate)}` : other ? `Invoice ${other.number}` : t.trigger,
        };
      }),
      voided: inv.status === "BATAL",
    },
  };
}

export async function loadReceiptPdf(id: string, scope: CompanyScope): Promise<{ data: ReceiptPdf; filename: string } | null> {
  const pay = await db.payment.findUnique({
    where: { id }, include: { invoice: { include: { term: true, project: { include: { customer: true } } } } },
  });
  if (!pay || !inScope(scope, pay.invoice.companyId) || !pay.invoice.project.customer) return null;
  const inv = pay.invoice;
  const partial = Math.round(num(pay.balanceAfter) * 100) > 0 || Math.round(num(pay.amount) * 100) < Math.round(num(inv.total) * 100);
  return {
    filename: `Kwitansi-${safeName(pay.receiptNumber)}.pdf`,
    data: {
      company: await pdfCompany(inv.companyId), number: pay.receiptNumber, date: pay.date,
      receivedFrom: inv.project.customer!.name, amount: num(pay.amount),
      purpose: paymentPurpose({ termLabel: inv.term?.label ?? "Pembayaran", percent: num(inv.percent), invoiceNumber: inv.number, partial }),
      methodLabel: METHOD_LABEL[pay.method], balanceAfter: num(pay.balanceAfter), voided: !!pay.voidedAt,
    },
  };
}
