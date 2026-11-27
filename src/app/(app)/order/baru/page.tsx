import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { projectScope } from "@/lib/project-scope";
import { orderAmounts } from "@/lib/billing";
import { fmtDateLong, fmtRp, toDateInput } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderForm } from "./order-form";

type SP = { penawaran?: string; proyek?: string };

export default async function OrderBaruPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("order", "create");
  const sp = await searchParams;
  const scoped = user.companies.length > 0 ? { companyId: { in: user.companies.map((c) => c.id) } } : {};
  const head = (sub: string) => (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Konfirmasi Order baru</h1>
      <p className="text-sm text-muted-foreground">{sub}</p>
    </div>
  );
  const products = await db.item.findMany({ where: { kind: "FINISHED", active: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } });

  if (sp.penawaran) {
    const q = await db.quotation.findFirst({
      where: { id: sp.penawaran, ...scoped }, include: { customer: true, lines: { orderBy: { sort: "asc" } }, order: true },
    });
    if (!q) notFound();
    const order = orderAmounts(q.lines.map((l) => ({ qty: l.qty, unitPrice: Number(l.unitPrice) })), Number(q.ppnRate));
    return (
      <div className="flex max-w-4xl flex-col gap-6">
        {head(`Dari penawaran ${q.number} · ${q.customer.name}. Proyek produksinya dibuat otomatis.`)}
        {q.order ? (
          <p className="text-sm">Penawaran ini sudah menjadi <Link className="underline" href={`/order/${q.order.id}`}>Konfirmasi Order {q.order.number}</Link>.</p>
        ) : (
          <OrderForm
            source="penawaran" sourceId={q.id} needTerms={false} order={order} products={products}
            lines={q.lines.map((l) => ({ id: l.id, description: l.description, qty: l.qty, unit: l.unit, unitPrice: Number(l.unitPrice), productId: l.productId }))}
            defaultDate={toDateInput(new Date())} defaultDue="" backHref={`/penawaran/${q.id}`}
          />
        )}
      </div>
    );
  }

  if (sp.proyek) {
    const p = await db.project.findFirst({
      where: { AND: [{ id: sp.proyek, kind: "ORDER" }, projectScope(user)] },
      include: { customer: true, salesOrder: true, terms: true, lines: { orderBy: { sort: "asc" }, include: { product: true } } },
    });
    if (!p) notFound();
    const order = orderAmounts(p.lines.map((l) => ({ qty: l.qty, unitPrice: Number(l.unitPrice) })), Number(p.ppnRate));
    return (
      <div className="flex max-w-4xl flex-col gap-6">
        {head(`Dari proyek ${p.code} · ${p.customer?.name ?? ""}. Barang dan harga mengikuti proyek.`)}
        {p.salesOrder ? (
          <p className="text-sm">Proyek ini sudah punya <Link className="underline" href={`/order/${p.salesOrder.id}`}>Konfirmasi Order {p.salesOrder.number}</Link>.</p>
        ) : (
          <OrderForm
            source="proyek" sourceId={p.id} needTerms={p.terms.length === 0} order={order} products={products}
            lines={p.lines.map((l) => ({ id: l.id, description: l.product.name, qty: l.qty, unit: l.product.unit, unitPrice: Number(l.unitPrice), productId: l.productId }))}
            defaultDate={toDateInput(new Date())} defaultDue={toDateInput(p.dueDate)} backHref={`/proyek/${p.id}`}
          />
        )}
      </div>
    );
  }

  const [quotations, projects] = await Promise.all([
    db.quotation.findMany({
      where: { ...scoped, status: { in: ["TERKIRIM", "DISETUJUI"] }, order: null }, orderBy: { date: "desc" }, take: 50,
      include: { customer: { select: { name: true } }, lines: { select: { qty: true, unitPrice: true } } },
    }),
    db.project.findMany({
      where: { AND: [{ kind: "ORDER", status: { not: "BATAL" }, salesOrder: null }, projectScope(user)] }, orderBy: { orderDate: "desc" }, take: 50,
      include: { customer: { select: { name: true } }, lines: { select: { qty: true, unitPrice: true } } },
    }),
  ]);
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      {head("Pilih sumbernya: penawaran yang disetujui pelanggan, atau proyek pesanan yang sudah ada.")}
      <Card>
        <CardHeader><CardTitle>Dari penawaran</CardTitle></CardHeader>
        <CardContent className="flex flex-col divide-y divide-border p-0">
          {quotations.length === 0 && <p className="p-4 text-sm text-muted-foreground">Tidak ada penawaran terkirim yang menunggu konfirmasi.</p>}
          {quotations.map((q) => (
            <Link key={q.id} href={`/order/baru?penawaran=${q.id}`} className="flex items-center justify-between gap-4 p-4 text-sm hover:bg-muted">
              <span><span className="font-medium">{q.number}</span> · {q.customer.name}<span className="block text-xs text-muted-foreground">{q.subject} · {fmtDateLong(q.date)}</span></span>
              <span className="tabular-nums">{fmtRp(orderAmounts(q.lines.map((l) => ({ qty: l.qty, unitPrice: Number(l.unitPrice) })), Number(q.ppnRate)).total)}</span>
            </Link>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Dari proyek yang sudah ada</CardTitle></CardHeader>
        <CardContent className="flex flex-col divide-y divide-border p-0">
          {projects.length === 0 && <p className="p-4 text-sm text-muted-foreground">Semua proyek pesanan sudah punya Konfirmasi Order.</p>}
          {projects.map((p) => (
            <Link key={p.id} href={`/order/baru?proyek=${p.id}`} className="flex items-center justify-between gap-4 p-4 text-sm hover:bg-muted">
              <span><span className="font-medium">{p.code}</span> · {p.customer?.name}<span className="block text-xs text-muted-foreground">{p.name} · {fmtDateLong(p.orderDate)}</span></span>
              <span className="tabular-nums">{fmtRp(orderAmounts(p.lines.map((l) => ({ qty: l.qty, unitPrice: Number(l.unitPrice) })), Number(p.ppnRate)).total)}</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
