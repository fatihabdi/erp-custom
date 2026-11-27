import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { projectScope } from "@/lib/project-scope";
import {
  currentStage, emptyStageDone, MANUAL_STAGES, orderTotals, overallPercent, projectMargin, stageBounds, stagesFor, stageStatus,
  STAGE_LABEL, STAGE_STATUS_LABEL, type StageName,
} from "@/lib/production";
import { daysUntil, fmtDate, fmtDateLong, fmtRp, toDateInput } from "@/lib/format";
import { paidOf } from "@/lib/documents";
import { paymentState } from "@/lib/billing";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TabsNav } from "@/components/ui/tabs-nav";
import {
  addCostAction, cancelDeliveryAction, cancelProjectAction, deleteCostAction, planDeliveryAction, shipDeliveryAction,
} from "../actions";
import { MaterialForm, QcForm, StageForm } from "./stage-forms";

const COST_LABEL = { BAHAN: "Bahan", TENAGA: "Tenaga kerja", LAIN: "Lain-lain" } as const;

export default async function ProyekDetailPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; ubah?: string }> }) {
  const user = await requirePermission("proyek");
  const { id } = await params;
  const p = await db.project.findFirst({
    where: { AND: [{ id }, projectScope(user)] },
    include: {
      company: true, customer: true,
      lines: { orderBy: { sort: "asc" }, include: { product: { select: { code: true, name: true, unit: true } }, stages: true } },
      deliveries: { orderBy: { seq: "asc" }, include: { lines: true } },
      costs: { orderBy: { incurredAt: "desc" } },
    },
  });
  if (!p) notFound();

  const order = p.kind === "ORDER";
  const sp = await searchParams;
  const tabReq = sp.tab;
  const canEdit = can(user.role, "proyek", "edit") && p.status === "BERJALAN";
  const stages = stagesFor(p.kind);

  const lines = p.lines.map((l) => {
    const done = emptyStageDone();
    const held: Partial<Record<StageName, string>> = {};
    for (const s of l.stages) { done[s.stage] = s.done; if (s.held) held[s.stage] = s.holdNote ?? ""; }
    return { ...l, unitPrice: Number(l.unitPrice), done, held };
  });
  const totals = orderTotals(lines, Number(p.ppnRate));
  const pct = overallPercent(lines, stages);
  const cur = currentStage(lines, stages);
  const margin = projectMargin(totals.subtotal, p.costs.map((c) => ({ category: c.category, amount: Number(c.amount) })));
  const units = lines.reduce((n, l) => n + l.qty, 0);
  const due = p.dueDate ? daysUntil(p.dueDate) : null;
  const elapsed = Math.max(0, -daysUntil(p.orderDate));
  const committed = new Map<string, number>();
  for (const d of p.deliveries.filter((d) => d.status !== "BATAL")) for (const l of d.lines) committed.set(l.lineId, (committed.get(l.lineId) ?? 0) + l.qty);

  // Dokumen penagihan proyek pesanan: KO, invoice, dan status pembayaran.
  const docs = order && can(user.role, "invoice", "view")
    ? {
        so: await db.salesOrder.findUnique({ where: { projectId: p.id }, select: { id: true, number: true, workDays: true, quotation: { select: { id: true, number: true } } } }),
        invoices: await db.invoice.findMany({ where: { projectId: p.id, status: "TERBIT" }, orderBy: { createdAt: "asc" }, include: { payments: { orderBy: { createdAt: "asc" } }, term: { select: { label: true } } } }),
      }
    : null;
  const billed = docs?.invoices.reduce((n, i) => n + Number(i.total), 0) ?? 0;
  const paidAll = docs?.invoices.reduce((n, i) => n + paidOf(i.payments), 0) ?? 0;

  const tab = (["biaya", "pembayaran", "dokumen"].includes(tabReq ?? "") && (tabReq === "biaya" || docs)) ? (tabReq as "biaya" | "pembayaran" | "dokumen")
    : tabReq === "pengiriman" && order ? "pengiriman" : "produksi";
  const updating = canEdit && tab === "produksi" && sp.ubah === "1";

  // Ringkasan pembayaran untuk kartu keempat: invoice pertama yang belum lunas jadi acuan keterangan.
  const payState = billed > 0 ? paymentState(billed, paidAll) : null;
  const openInv = docs?.invoices.find((i) => paidOf(i.payments) < Number(i.total));
  const payHint = !docs ? "" : docs.invoices.length === 0 ? "Belum ada invoice terbit"
    : openInv ? `${fmtRp(paidOf(openInv.payments))} dari ${openInv.term?.label ?? "invoice"} ${fmtRp(Number(openInv.total))}`
    : `Terbayar ${fmtRp(paidAll)}`;

  const tabHref = (t: string) => `/proyek/${p.id}${t === "produksi" ? "" : `?tab=${t}`}`;
  const statusBadge = { BERJALAN: "Dikerjakan", SELESAI: "Selesai", BATAL: "Dibatalkan" }[p.status];

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{p.customer?.name ?? p.name}</h1>
            {p.company ? (
              <Badge variant={Number(p.ppnRate) > 0 ? "default" : "outline"}>
                {p.company.code} · {Number(p.ppnRate) > 0 ? `PPN ${Number(p.ppnRate)}%` : "Non-PPN"}
              </Badge>
            ) : <Badge variant="secondary">Stok internal</Badge>}
            <Badge dot={p.status === "BERJALAN" ? "black" : p.status === "SELESAI" ? "green" : "gray"}>{statusBadge}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {docs?.so
              ? <>{docs.so.number}{docs.so.quotation ? ` · dari penawaran ${docs.so.quotation.number}` : ""}</>
              : <>{p.code}{p.customer ? ` · ${p.name}` : ""}{p.orderRef ? ` · ${p.orderRef}` : ""}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {docs?.so && <Button asChild variant="outline"><Link href={`/order/${docs.so.id}`}>Lihat KO</Link></Button>}
          {canEdit && <Button asChild variant="outline"><Link href={tabHref("biaya")}>Catat biaya</Link></Button>}
          {can(user.role, "proyek", "delete") && p.status === "BERJALAN" && (
            <ActionForm action={cancelProjectAction} submit="Batalkan proyek" variant="ghost" confirm="Batalkan proyek ini? Tindakan ini tidak bisa diurungkan.">
              <input type="hidden" name="projectId" value={p.id} />
            </ActionForm>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {order ? (
          <StatCard title="Nilai order" value={fmtRp(totals.total)} hint={Number(p.ppnRate) > 0 ? `Termasuk PPN ${Number(p.ppnRate)}%` : "Tanpa PPN"} />
        ) : (
          <StatCard title="Jumlah produksi" value={`${units} unit`} hint="Hasil QC lulus masuk stok" />
        )}
        <StatCard title={order ? "Tanggal order" : "Tanggal mulai"} value={fmtDateLong(p.orderDate)} hint={docs?.so?.workDays ? `Pengerjaan ${docs.so.workDays} hari kerja` : `Berjalan ${elapsed} hari`} />
        <StatCard title={order ? "Estimasi selesai kirim" : "Target selesai"} value={p.dueDate ? fmtDateLong(p.dueDate) : "—"}
          hint={due === null ? "Belum ditentukan" : due < 0 ? `Lewat ${-due} hari` : `${due} hari lagi`} tone={due !== null && due < 0 ? "red" : undefined} />
        {docs ? (
          <StatCard title="Pembayaran" value={payState === "LUNAS" ? "Lunas" : payState === "SEBAGIAN" ? "Sebagian" : payState === "BELUM" ? "Belum bayar" : "Belum ditagih"}
            hint={payHint} tone={payState === "SEBAGIAN" ? "amber" : undefined} />
        ) : (
          <StatCard title="Progres" value={`${pct}%`} hint={cur ? `Tahap ${STAGE_LABEL[cur]}` : p.status === "SELESAI" ? "Semua tahap selesai" : "—"} />
        )}
      </div>

      <TabsNav items={[
        { href: tabHref("produksi"), label: "Produksi", active: tab === "produksi" },
        ...(order ? [{ href: tabHref("pengiriman"), label: "Pengiriman", active: tab === "pengiriman" }] : []),
        { href: tabHref("biaya"), label: "Biaya", active: tab === "biaya" },
        ...(docs ? [
          { href: tabHref("pembayaran"), label: "Pembayaran", active: tab === "pembayaran" },
          { href: tabHref("dokumen"), label: "Dokumen", active: tab === "dokumen" },
        ] : []),
      ]} />

      {tab === "produksi" && (
        <>
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <CardTitle>Tahapan produksi</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Rangka besi dan potong kayu berjalan paralel{order ? "" : "; produksi stok berhenti di QC, barang jadi masuk stok saat QC lulus"}
                </p>
              </div>
              {canEdit && (
                <Button asChild variant={updating ? "outline" : "default"}>
                  <Link href={updating ? tabHref("produksi") : `${tabHref("produksi")}?ubah=1`} scroll={false}>{updating ? "Tutup" : "Perbarui progres"}</Link>
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-8">
              {lines.map((l, idx) => {
                const left = l.qty - l.issuedUnits;
                const options = MANUAL_STAGES.filter((s) => stages.includes(s)).map((s) => {
                  const b = stageBounds(s, l.done, l.qty, l.issuedUnits);
                  return { stage: s, label: STAGE_LABEL[s], done: l.done[s], min: b.min, max: b.max, held: s in l.held, note: l.held[s] ?? "" };
                });
                return (
                  <section key={l.id} className={idx > 0 ? "border-t border-border pt-6" : ""}>
                    <h3 className="mb-3 text-sm font-semibold">{l.product.name} <span className="font-normal text-muted-foreground">{l.qty} {l.product.unit}</span></h3>
                    <div className="flex items-center gap-2 overflow-x-auto p-1">
                      <div className="flex flex-col gap-2">
                        <StageBox stage="RANGKA_BESI" line={l} />
                        <StageBox stage="POTONG_KAYU" line={l} />
                      </div>
                      {stages.filter((s) => s !== "RANGKA_BESI" && s !== "POTONG_KAYU").map((s) => (
                        <div key={s} className="flex items-center gap-2">
                          <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <StageBox stage={s} line={l} />
                        </div>
                      ))}
                    </div>
                    {updating && (
                      <div className="mt-4 grid gap-5 rounded-lg border border-border p-4">
                        <MaterialForm lineId={l.id} left={left} issued={l.issuedUnits} qty={l.qty} />
                        <StageForm lineId={l.id} options={options} />
                        <QcForm lineId={l.id} ready={l.done.FINISHING - l.done.QC} />
                      </div>
                    )}
                  </section>
                );
              })}
            </CardContent>
          </Card>

          <div className={`grid gap-6 ${order ? "lg:grid-cols-[1fr_24rem]" : ""} items-start`}>
            {order && (
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div className="flex flex-col gap-1"><CardTitle>Jadwal pengiriman</CardTitle><p className="text-sm text-muted-foreground">Bisa bertahap</p></div>
                  <Button asChild variant="outline"><Link href={tabHref("pengiriman")}>{canEdit ? "Catat pengiriman" : "Lihat pengiriman"}</Link></Button>
                </CardHeader>
                <CardContent>
                  <DeliveryTable p={p} lines={lines} canEdit={false} />
                </CardContent>
              </Card>
            )}
            <MarginCard margin={margin} subtotal={totals.subtotal} />
          </div>
        </>
      )}

      {tab === "pengiriman" && order && (
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_24rem]">
          <Card>
            <CardHeader><CardTitle>Pengiriman</CardTitle><p className="text-sm text-muted-foreground">Barang jadi dikirim dari stok; stok berkurang saat pengiriman dicatat terkirim</p></CardHeader>
            <CardContent>
              <DeliveryTable p={p} lines={lines} canEdit={canEdit} />
              <Table className="mt-6">
                <THead><TR><TH>Barang</TH><TH className="text-right">Dipesan</TH><TH className="text-right">Dipacking</TH><TH className="text-right">Terkirim</TH></TR></THead>
                <TBody>
                  {lines.map((l) => (
                    <TR key={l.id}><TD>{l.product.name}</TD>
                      <TD className="text-right tabular-nums">{l.qty}</TD>
                      <TD className="text-right tabular-nums">{l.done.PACKING}</TD>
                      <TD className="text-right tabular-nums">{l.done.KIRIM}</TD></TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
          {canEdit && (
            <Card>
              <CardHeader><CardTitle>Rencanakan pengiriman</CardTitle></CardHeader>
              <CardContent>
                <ActionForm action={planDeliveryAction} submit="Buat rencana" className="grid gap-3">
                  <input type="hidden" name="projectId" value={p.id} />
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="plannedDate">Tanggal rencana</Label>
                    <Input id="plannedDate" name="plannedDate" type="date" defaultValue={toDateInput(p.dueDate)} />
                  </div>
                  {lines.map((l) => {
                    const room = l.qty - (committed.get(l.id) ?? 0);
                    return (
                      <div key={l.id} className="flex flex-col gap-1.5">
                        <Label htmlFor={`qty_${l.id}`}>{l.product.name} ({l.product.unit})</Label>
                        <Input id={`qty_${l.id}`} name={`qty_${l.id}`} inputMode="numeric" placeholder="0" disabled={room <= 0} />
                        <p className="text-xs text-muted-foreground">Belum dijadwalkan {room} dari {l.qty}</p>
                      </div>
                    );
                  })}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="dnote">Catatan</Label>
                    <Input id="dnote" name="note" maxLength={200} />
                  </div>
                </ActionForm>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "pembayaran" && docs && (
        <Card>
          <CardHeader>
            <CardTitle>Pembayaran</CardTitle>
            <p className="text-sm text-muted-foreground">
              Ditagih {fmtRp(billed)} dari {fmtRp(totals.total)} · dibayar {fmtRp(paidAll)} · piutang {fmtRp(Math.max(0, billed - paidAll))}
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <THead><TR><TH>Invoice</TH><TH>Termin</TH><TH>Jatuh tempo</TH><TH className="text-right">Tagihan</TH><TH className="text-right">Dibayar</TH><TH>Status</TH></TR></THead>
                <TBody>
                  {docs.invoices.length === 0 && <TR><TD colSpan={6} className="py-8 text-center text-muted-foreground">Belum ada invoice terbit untuk proyek ini.</TD></TR>}
                  {docs.invoices.map((i) => {
                    const paid = paidOf(i.payments);
                    const st = paymentState(Number(i.total), paid);
                    const late = st !== "LUNAS" && daysUntil(i.dueDate) < 0;
                    return (
                      <TR key={i.id}>
                        <TD><Link href={`/invoice/${i.id}`} className="font-medium hover:underline">{i.number}</Link></TD>
                        <TD>{i.term?.label ?? "—"}</TD>
                        <TD className="whitespace-nowrap">{fmtDate(i.dueDate)}</TD>
                        <TD className="text-right tabular-nums">{fmtRp(Number(i.total))}</TD>
                        <TD className="text-right tabular-nums">{fmtRp(paid)}</TD>
                        <TD>
                          <Badge dot={late ? "red" : st === "LUNAS" ? "green" : st === "SEBAGIAN" ? "amber" : "black"}>
                            {late ? "Lewat jatuh tempo" : st === "LUNAS" ? "Lunas" : st === "SEBAGIAN" ? "Dibayar sebagian" : "Menunggu bayar"}
                          </Badge>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "dokumen" && docs && (
        <Card>
          <CardHeader><CardTitle>Dokumen</CardTitle><p className="text-sm text-muted-foreground">Penawaran, Konfirmasi Order, invoice, dan kwitansi proyek ini</p></CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <THead><TR><TH>Dokumen</TH><TH>Nomor</TH><TH /></TR></THead>
                <TBody>
                  {docs.so?.quotation && (
                    <TR><TD>Penawaran</TD>
                      <TD><Link href={`/penawaran/${docs.so.quotation.id}`} className="font-medium hover:underline">{docs.so.quotation.number}</Link></TD>
                      <TD className="text-right"><a href={`/api/dokumen/penawaran/${docs.so.quotation.id}`} target="_blank" rel="noreferrer" className="hover:underline">PDF</a></TD></TR>
                  )}
                  {docs.so && (
                    <TR><TD>Konfirmasi Order</TD>
                      <TD><Link href={`/order/${docs.so.id}`} className="font-medium hover:underline">{docs.so.number}</Link></TD>
                      <TD className="text-right"><a href={`/api/dokumen/konfirmasi-order/${docs.so.id}`} target="_blank" rel="noreferrer" className="hover:underline">PDF</a></TD></TR>
                  )}
                  {docs.invoices.map((i) => (
                    <TR key={i.id}><TD>Invoice{i.term ? ` · ${i.term.label}` : ""}</TD>
                      <TD><Link href={`/invoice/${i.id}`} className="font-medium hover:underline">{i.number}</Link></TD>
                      <TD className="text-right"><a href={`/api/dokumen/invoice/${i.id}`} target="_blank" rel="noreferrer" className="hover:underline">PDF</a></TD></TR>
                  ))}
                  {docs.invoices.flatMap((i) => i.payments.filter((x) => !x.voidedAt).map((x) => (
                    <TR key={x.id}><TD>Kwitansi</TD><TD className="font-medium">{x.receiptNumber}</TD>
                      <TD className="text-right"><a href={`/api/dokumen/kwitansi/${x.id}`} target="_blank" rel="noreferrer" className="hover:underline">PDF</a></TD></TR>
                  )))}
                </TBody>
              </Table>
            </div>
            {!docs.so && (can(user.role, "order", "create") && p.status !== "BATAL"
              ? <p><Link href={`/order/baru?proyek=${p.id}`} className="font-medium underline">Buat Konfirmasi Order</Link> untuk proyek ini lebih dulu sebelum menagih.</p>
              : <p className="text-muted-foreground">Belum ada Konfirmasi Order.</p>)}
          </CardContent>
        </Card>
      )}

      {tab === "biaya" && (
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
          <Card>
            <CardHeader><CardTitle>Biaya proyek</CardTitle><p className="text-sm text-muted-foreground">Bahan dari stok tercatat otomatis saat bahan dikeluarkan</p></CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead><TR><TH>Tanggal</TH><TH>Jenis</TH><TH>Keterangan</TH><TH className="text-right">Jumlah</TH>{canEdit && <TH />}</TR></THead>
                <TBody>
                  {p.costs.length === 0 && <TR><TD colSpan={5} className="py-8 text-center text-muted-foreground">Belum ada biaya.</TD></TR>}
                  {p.costs.map((c) => (
                    <TR key={c.id}>
                      <TD className="whitespace-nowrap">{fmtDate(c.incurredAt)}</TD>
                      <TD>{COST_LABEL[c.category]}{c.source && <Badge variant="secondary" className="ml-2">Stok</Badge>}</TD>
                      <TD>{c.description}</TD>
                      <TD className="text-right tabular-nums">{fmtRp(Number(c.amount))}</TD>
                      {canEdit && (
                        <TD className="text-right">
                          {!c.source && (
                            <ActionForm action={deleteCostAction} submit="Hapus" variant="ghost" size="sm" confirm="Hapus biaya ini?">
                              <input type="hidden" name="costId" value={c.id} />
                            </ActionForm>
                          )}
                        </TD>
                      )}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
          <div className="flex flex-col gap-6">
            <MarginCard margin={margin} subtotal={totals.subtotal} />
            {canEdit && (
              <Card>
                <CardHeader><CardTitle>Catat biaya</CardTitle></CardHeader>
                <CardContent>
                  <ActionForm action={addCostAction} submit="Simpan biaya" className="grid gap-3">
                    <input type="hidden" name="projectId" value={p.id} />
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="category">Jenis</Label>
                      <Select id="category" name="category" defaultValue="TENAGA">
                        <option value="TENAGA">Tenaga kerja</option>
                        <option value="BAHAN">Bahan (pembelian langsung)</option>
                        <option value="LAIN">Lain-lain</option>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="description">Keterangan</Label>
                      <Input id="description" name="description" required maxLength={200} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="amount">Jumlah (Rp)</Label>
                      <Input id="amount" name="amount" inputMode="decimal" required placeholder="1.500.000" />
                    </div>
                  </ActionForm>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const STAGE_TONE = {
  SELESAI: { dot: "bg-success", bar: "default" },
  BERJALAN: { dot: "bg-foreground", bar: "default" },
  TERTAHAN: { dot: "bg-warning", bar: "amber" },
  BELUM: { dot: "bg-zinc-300", bar: "default" },
} as const;

function StageBox({ stage, line }: { stage: StageName; line: { qty: number; done: Record<StageName, number>; held: Partial<Record<StageName, string>> } }) {
  const done = line.done[stage];
  const st = stageStatus(done, line.qty, stage in line.held);
  const tone = STAGE_TONE[st];
  return (
    <div
      className={`w-[9.5rem] shrink-0 rounded-lg border bg-card p-3 shadow-sm ${st === "TERTAHAN" ? "border-warning" : st === "BERJALAN" ? "border-foreground ring-1 ring-foreground" : "border-border"}`}
      title={st === "TERTAHAN" ? line.held[stage] : undefined}
    >
      <div className="flex items-center justify-between gap-2 text-sm font-semibold">
        {STAGE_LABEL[stage]}
        <span aria-hidden className={`size-2 rounded-full ${tone.dot}`} />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{done}/{line.qty} · {STAGE_STATUS_LABEL[st]}</div>
      <Progress value={line.qty ? (done / line.qty) * 100 : 0} tone={tone.bar} className="mt-2" />
    </div>
  );
}

function MarginCard({ margin, subtotal }: { margin: ReturnType<typeof projectMargin>; subtotal: number }) {
  const row = (k: string, v: number) => (
    <div className="flex justify-between text-sm"><dt className="text-muted-foreground">{k}</dt><dd className="tabular-nums">{fmtRp(v)}</dd></div>
  );
  return (
    <Card>
      <CardHeader><CardTitle>Biaya & margin</CardTitle><p className="text-sm text-muted-foreground">Margin dihitung tanpa PPN</p></CardHeader>
      <CardContent>
        <dl className="grid gap-2">
          {row("Nilai order (tanpa PPN)", subtotal)}
          {row("Bahan (dari stok terpakai)", margin.bahan)}
          {row("Tenaga kerja", margin.tenaga)}
          {row("Lain-lain", margin.lain)}
          <div className="mt-1 flex justify-between border-t border-border pt-3 font-medium">
            <dt>Margin sementara{margin.percent !== null ? ` (${String(margin.percent).replace(".", ",")}%)` : ""}</dt>
            <dd className="whitespace-nowrap tabular-nums">{fmtRp(margin.margin)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

type DeliveryProject = {
  id: string;
  deliveries: { id: string; seq: number; plannedDate: Date | null; shippedAt: Date | null; status: "RENCANA" | "TERKIRIM" | "BATAL"; note: string | null; lines: { lineId: string; qty: number }[] }[];
};

function DeliveryTable({ p, lines, canEdit }: { p: DeliveryProject; lines: { id: string; product: { name: string; unit: string } }[]; canEdit: boolean }) {
  const name = new Map(lines.map((l) => [l.id, l.product]));
  const label = { RENCANA: "Belum mulai", TERKIRIM: "Terkirim", BATAL: "Dibatalkan" } as const;
  return (
    <div className="overflow-hidden rounded-lg border border-border">
    <Table>
      <THead><TR><TH>Rencana</TH><TH>Isi</TH><TH>Status</TH>{canEdit && <TH />}</TR></THead>
      <TBody>
        {p.deliveries.length === 0 && <TR><TD colSpan={canEdit ? 4 : 3} className="py-6 text-center text-muted-foreground">Belum ada pengiriman.</TD></TR>}
        {p.deliveries.map((d) => (
          <TR key={d.id}>
            <TD className="whitespace-nowrap">{d.status === "TERKIRIM" && d.shippedAt ? fmtDate(d.shippedAt) : d.plannedDate ? fmtDate(d.plannedDate) : "—"}</TD>
            <TD>{d.lines.map((l) => `${l.qty} ${name.get(l.lineId)?.unit ?? ""} ${name.get(l.lineId)?.name ?? ""}`).join(", ")}</TD>
            <TD><Badge dot={d.status === "TERKIRIM" ? "green" : d.status === "BATAL" ? "red" : "gray"}>{label[d.status]}</Badge></TD>
            {canEdit && (
              <TD>
                {d.status === "RENCANA" && (
                  <div className="flex justify-end gap-2">
                    <ActionForm action={shipDeliveryAction} submit="Kirim" size="sm" confirm="Catat pengiriman ini terkirim? Stok barang jadi akan berkurang.">
                      <input type="hidden" name="deliveryId" value={d.id} />
                    </ActionForm>
                    <ActionForm action={cancelDeliveryAction} submit="Batal" size="sm" variant="ghost">
                      <input type="hidden" name="deliveryId" value={d.id} />
                    </ActionForm>
                  </div>
                )}
              </TD>
            )}
          </TR>
        ))}
      </TBody>
    </Table>
    </div>
  );
}
