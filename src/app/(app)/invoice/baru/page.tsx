import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { projectScope } from "@/lib/project-scope";
import { addDays } from "@/lib/billing";
import { projectTermPlan } from "@/lib/documents";
import { fmtDateLong, fmtNum, fmtRp, toDateInput } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createInvoiceAction } from "../actions";

type SP = { proyek?: string; termin?: string };

export default async function InvoiceBaruPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("invoice", "create");
  const sp = await searchParams;
  const head = (sub: string) => (
    <div>
      <p className="text-sm text-muted-foreground"><Link href="/invoice" className="hover:underline">Invoice</Link> / Baru</p>
      <h1 className="text-2xl font-semibold">Invoice baru</h1>
      <p className="text-sm text-muted-foreground">{sub}</p>
    </div>
  );

  if (!sp.proyek) {
    const projects = await db.project.findMany({
      where: { AND: [{ kind: "ORDER", status: { not: "BATAL" }, salesOrder: { isNot: null } }, projectScope(user)] },
      orderBy: { orderDate: "desc" }, take: 100,
      include: { customer: { select: { name: true } }, salesOrder: { select: { number: true } }, terms: { select: { id: true } }, invoices: { where: { status: "TERBIT" }, select: { termId: true } } },
    });
    const open = projects.filter((p) => p.terms.some((t) => !p.invoices.some((i) => i.termId === t.id)));
    return (
      <div className="flex max-w-4xl flex-col gap-6">
        {head("Pilih proyek yang masih punya termin belum ditagih. Invoice dibuat dari Konfirmasi Order.")}
        <Card>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {open.length === 0 && <p className="p-4 text-sm text-muted-foreground">Semua termin sudah ditagih, atau belum ada Konfirmasi Order.</p>}
            {open.map((p) => (
              <Link key={p.id} href={`/invoice/baru?proyek=${p.id}`} className="flex items-center justify-between gap-4 p-4 text-sm hover:bg-muted">
                <span><span className="font-medium">{p.salesOrder?.number}</span> · {p.customer?.name}<span className="block text-xs text-muted-foreground">{p.code} · {p.name}</span></span>
                <span className="text-xs text-muted-foreground">{p.terms.filter((t) => !p.invoices.some((i) => i.termId === t.id)).length} termin belum ditagih</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  const owned = await db.project.findFirst({ where: { AND: [{ id: sp.proyek }, projectScope(user)] }, select: { id: true } });
  if (!owned) notFound();
  const { project, terms, order } = await db.$transaction((tx) => projectTermPlan(tx, sp.proyek!));
  const [so, invoices, deliveries, customer] = await Promise.all([
    db.salesOrder.findUnique({ where: { projectId: project.id } }),
    db.invoice.findMany({ where: { projectId: project.id, status: "TERBIT" }, select: { termId: true, number: true } }),
    db.delivery.findMany({ where: { projectId: project.id, status: { not: "BATAL" } }, orderBy: { seq: "asc" }, include: { lines: true } }),
    project.customerId ? db.customer.findUnique({ where: { id: project.customerId } }) : null,
  ]);
  if (!so) {
    return (
      <div className="flex max-w-4xl flex-col gap-6">
        {head(`${project.code} · ${customer?.name ?? ""}`)}
        <p className="text-sm">Proyek ini belum punya Konfirmasi Order. <Link className="underline" href={`/order/baru?proyek=${project.id}`}>Buat Konfirmasi Order</Link> lebih dulu.</p>
      </div>
    );
  }
  const termId = sp.termin && terms.some((t) => t.id === sp.termin) ? sp.termin : undefined;
  const chosen = terms.find((t) => t.id === termId);
  const today = new Date();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {head(`${so.number} · ${customer?.name ?? ""} · nilai order ${fmtRp(order.total)}`)}
      <Card>
        <CardHeader><CardTitle>Pilih termin yang ditagih</CardTitle></CardHeader>
        <CardContent className="flex flex-col divide-y divide-border p-0">
          {terms.map((t) => {
            const inv = invoices.find((i) => i.termId === t.id);
            const row = (
              <span className="flex w-full items-center justify-between gap-4">
                <span><span className="font-medium">{t.label} {t.percent}%</span><span className="block text-xs text-muted-foreground">{t.trigger}</span></span>
                <span className="flex items-center gap-2"><span className="tabular-nums">{fmtRp(t.amount.total)}</span>{inv && <Badge variant="secondary">{inv.number}</Badge>}{t.id === termId && <Badge>Dipilih</Badge>}</span>
              </span>
            );
            return inv
              ? <div key={t.id} className="p-4 text-sm text-muted-foreground">{row}</div>
              : <Link key={t.id} href={`/invoice/baru?proyek=${project.id}&termin=${t.id}`} className="p-4 text-sm hover:bg-muted">{row}</Link>;
          })}
        </CardContent>
      </Card>

      {chosen && (
        <Card>
          <CardHeader><CardTitle>Rincian invoice</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid gap-1 rounded-lg border border-border p-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Jumlah ({chosen.percent}% dari {fmtNum(order.subtotal)})</dt><dd className="tabular-nums">{fmtRp(chosen.amount.subtotal)}</dd></div>
              {Number(project.ppnRate) > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">PPN {Number(project.ppnRate)}%</dt><dd className="tabular-nums">{fmtRp(chosen.amount.ppn)}</dd></div>}
              <div className="flex justify-between font-medium"><dt>Total tagihan</dt><dd className="tabular-nums">{fmtRp(chosen.amount.total)}</dd></div>
            </dl>
            <ActionForm action={createInvoiceAction} submit="Terbitkan invoice" className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="termId" value={chosen.id} />
              <div className="flex flex-col gap-1.5"><Label htmlFor="date">Tanggal invoice</Label><Input id="date" name="date" type="date" defaultValue={toDateInput(today)} /></div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dueDate">Jatuh tempo</Label>
                <Input id="dueDate" name="dueDate" type="date" defaultValue={toDateInput(addDays(today, chosen.dueDays))} />
              </div>
              {deliveries.length > 0 && (
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="deliveryId">Pengiriman yang ditagih (opsional)</Label>
                  <Select id="deliveryId" name="deliveryId" defaultValue="">
                    <option value="">Seluruh pesanan</option>
                    {deliveries.map((d) => (
                      <option key={d.id} value={d.id}>Pengiriman ke-{d.seq} · {d.status === "TERKIRIM" && d.shippedAt ? `terkirim ${fmtDateLong(d.shippedAt)}` : "rencana"}</option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground">Dipakai untuk termin “saat barang dikirim”: rincian barang pengiriman itu tercetak di invoice.</p>
                </div>
              )}
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
