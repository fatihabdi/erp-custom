import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can, canUpdateStage } from "@/lib/permissions";
import {
  emptyStageDone, MANUAL_STAGES, overallPercent, STAGE_LABEL, STAGE_STATUS_LABEL, stageBounds, stagesFor, stageStatus, type StageName,
} from "@/lib/production";
import { specLines } from "@/lib/sales-order";
import { fmtDateLong, fmtNum } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SoEditForm, SoImageForm, SoStageForm } from "./so-forms";

export default async function SalesOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("sales-order");
  const { id } = await params;
  const so = await db.productionOrder.findUnique({
    where: { id },
    include: {
      company: { select: { code: true } },
      order: { select: { id: true, number: true, deliveryLocation: true, date: true } },
      project: {
        select: {
          id: true, code: true, kind: true, status: true, dueDate: true, customer: { select: { name: true, address: true } },
        },
      },
      lines: {
        orderBy: { sort: "asc" },
        include: {
          image: { select: { lineId: true } },
          projectLine: { include: { product: { select: { code: true, unit: true } }, stages: true } },
        },
      },
    },
  });
  if (!so || (user.companies.length > 0 && !user.companies.some((c) => c.id === so.companyId))) notFound();

  const p = so.project;
  const stages = stagesFor(p.kind);
  const active = p.status === "BERJALAN";
  const canEdit = can(user.role, "sales-order", "edit") && p.status !== "BATAL";
  const address = so.order.deliveryLocation ?? p.customer?.address ?? "—";
  const lines = so.lines.map((l) => {
    const pl = l.projectLine;
    const done = emptyStageDone();
    const held: Partial<Record<StageName, string>> = {};
    for (const s of pl.stages) { done[s.stage] = s.done; if (s.held) held[s.stage] = s.holdNote ?? ""; }
    const options = MANUAL_STAGES.filter((s) => stages.includes(s) && canUpdateStage(user.role, s)).map((s) => {
      const b = stageBounds(s, done, pl.qty, pl.issuedUnits);
      return { stage: s, label: STAGE_LABEL[s], done: done[s], min: b.min, max: b.max, held: s in held, note: held[s] ?? "" };
    });
    return { l, pl, done, held, options };
  });
  const pct = overallPercent(lines.map(({ pl, done }) => ({ qty: pl.qty, done })), stages);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{so.number}</h1>
            <Badge variant="outline">{so.company.code}</Badge>
            {p.status === "SELESAI" && <Badge>Selesai</Badge>}
            {p.status === "BATAL" && <Badge variant="secondary">Proyek dibatalkan</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            Sales Order untuk seluruh unit produksi · dari{" "}
            {can(user.role, "order", "view") ? <Link href={`/order/${so.order.id}`} className="underline">{so.order.number}</Link> : so.order.number}
          </p>
        </div>
        <div className="flex w-56 flex-col gap-1.5">
          <div className="flex justify-between text-xs text-muted-foreground"><span>Progres keseluruhan</span><span className="tabular-nums">{pct}%</span></div>
          <Progress value={pct} />
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-px overflow-hidden rounded-lg bg-border p-0 sm:grid-cols-2">
          <Field label="Tanggal SO" value={fmtDateLong(so.order.date)} />
          <Field label="Tanggal pengiriman" value={p.dueDate ? fmtDateLong(p.dueDate) : "Belum ditentukan"} />
          <Field label="Nama pemesan" value={p.customer?.name ?? "—"} />
          <Field label="Alamat pengiriman" value={address} />
        </CardContent>
      </Card>

      {lines.map(({ l, pl, done, held, options }, idx) => (
        <Card key={l.id}>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>{l.title}</CardTitle>
              <p className="text-sm text-muted-foreground">{pl.product.code}{lines.length > 1 ? ` · barang ${idx + 1} dari ${lines.length}` : ""}</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold tabular-nums">{fmtNum(pl.qty)}</div>
              <div className="text-sm text-muted-foreground">{pl.product.unit}</div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-[1fr_16rem]">
              <div>
                <h3 className="mb-2 text-sm font-semibold">Spesifikasi</h3>
                {specLines(l.spec).length > 0 ? (
                  <ul className="flex flex-col gap-1 text-sm">{specLines(l.spec).map((s, i) => <li key={i}>{s}</li>)}</ul>
                ) : <p className="text-sm text-muted-foreground">Belum ada spesifikasi.</p>}
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Gambar</h3>
                {l.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/sales-order/${l.id}/gambar`} alt={`Gambar ${l.title}`} className="max-h-56 w-full rounded-lg border border-border object-contain" />
                ) : <p className="flex h-28 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">Belum ada gambar</p>}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Tahapan produksi</h3>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <div className="flex flex-col gap-2">
                  <StageBox stage="RANGKA_BESI" qty={pl.qty} done={done} held={held} />
                  <StageBox stage="POTONG_KAYU" qty={pl.qty} done={done} held={held} />
                </div>
                {stages.filter((s) => s !== "RANGKA_BESI" && s !== "POTONG_KAYU").map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <StageBox stage={s} qty={pl.qty} done={done} held={held} />
                  </div>
                ))}
              </div>
              {active && options.length > 0 && (
                <details className="mt-3 rounded-lg border border-border">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Perbarui progres</summary>
                  <div className="border-t border-border p-3"><SoStageForm projectLineId={pl.id} options={options} /></div>
                </details>
              )}
            </div>

            {canEdit && (
              <details className="rounded-lg border border-border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Gambar acuan</summary>
                <div className="border-t border-border p-3"><SoImageForm lineId={l.id} hasImage={!!l.image} /></div>
              </details>
            )}
          </CardContent>
        </Card>
      ))}

      {so.notes && (
        <Card>
          <CardHeader><CardTitle>Catatan untuk produksi</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-line text-sm">{so.notes}</p></CardContent>
        </Card>
      )}

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Ubah Sales Order</CardTitle>
            <p className="text-sm text-muted-foreground">Nama, spesifikasi, dan catatan. Jumlah, pemesan, alamat, dan tanggal kirim mengikuti Konfirmasi Order dan proyek.</p>
          </CardHeader>
          <CardContent>
            <SoEditForm id={so.id} notes={so.notes ?? ""} lines={so.lines.map((l) => ({ id: l.id, title: l.title, spec: l.spec ?? "" }))} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function StageBox({ stage, qty, done, held }: { stage: StageName; qty: number; done: Record<StageName, number>; held: Partial<Record<StageName, string>> }) {
  const d = done[stage];
  const st = stageStatus(d, qty, stage in held);
  return (
    <div
      className={`w-36 shrink-0 rounded-lg border p-3 ${st === "TERTAHAN" ? "border-dashed border-foreground" : st === "BERJALAN" ? "border-foreground" : "border-border"}`}
      title={st === "TERTAHAN" ? held[stage] : undefined}
    >
      <div className="flex items-center justify-between gap-2 text-sm font-medium">
        {STAGE_LABEL[stage]}
        <span aria-hidden className={`size-2 rounded-full ${st === "SELESAI" || st === "BERJALAN" ? "bg-foreground" : st === "TERTAHAN" ? "border border-foreground" : "bg-muted-foreground/30"}`} />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{d}/{qty} · {STAGE_STATUS_LABEL[st]}</div>
      <Progress value={qty ? (d / qty) * 100 : 0} className="mt-2" />
    </div>
  );
}
