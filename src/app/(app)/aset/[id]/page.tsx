import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assetScope } from "@/lib/asset-scope";
import {
  MAINTENANCE_LABEL, STATUS_LABEL, TYPE_LABEL, depreciation, dueState, isTerminal, wibDay,
  type AssetStatusName, type AssetTypeName, type MaintenanceTypeName,
} from "@/lib/asset";
import { fmtDateLong, fmtRp } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  AssetEditForm, AssignForm, DeleteAssetForm, DeleteMaintenanceForm, DisposeForm, MaintenanceForm, MoveForm, ReturnForm, StatusForm,
} from "./asset-forms";

export default async function AsetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("aset");
  const { id } = await params;
  const asset = await db.asset.findFirst({
    where: { id, ...assetScope(user) },
    include: {
      company: { select: { code: true, name: true } }, category: true,
      maintenance: { orderBy: [{ performedAt: "desc" }, { createdAt: "desc" }] },
      assignments: { orderBy: [{ assignedAt: "desc" }, { createdAt: "desc" }] },
    },
  });
  if (!asset) notFound();

  const canEdit = can(user.role, "aset", "edit");
  const canDelete = can(user.role, "aset", "delete");
  const canDispose = can(user.role, "aset", "approve");
  const status = asset.status as AssetStatusName;
  const terminal = isTerminal(status);
  const today = wibDay();
  const todayStr = today.toISOString().slice(0, 10); // tanggal WIB hari ini
  const dep = depreciation({
    cost: Number(asset.acquisitionCost), salvage: Number(asset.salvageValue), lifeMonths: asset.usefulLifeMonths,
    acquiredAt: asset.acquiredAt, disposedAt: asset.disposedAt, asOf: today,
  });
  const open = asset.assignments.find((a) => !a.returnedAt);
  const nextDue = terminal ? null : asset.maintenance[0]?.nextDueAt ?? null;
  const due = dueState(nextDue, today);
  const totalMaint = asset.maintenance.reduce((n, m) => n + Number(m.cost), 0);
  const dateIn = (d: Date) => d.toISOString().slice(0, 10);
  const gain = asset.disposalValue !== null && asset.status === "DIJUAL" ? Number(asset.disposalValue) - dep.bookValue : null;

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{asset.name}</h1>
          <p className="text-sm text-muted-foreground">
            {asset.code} · {asset.company.code} · {TYPE_LABEL[asset.category.type as AssetTypeName]} — {asset.category.name}
            {asset.location ? ` · ${asset.location}` : ""}
          </p>
        </div>
        <Badge dot={status === "AKTIF" ? "green" : status === "RUSAK" ? "red" : status === "PERAWATAN" ? "amber" : "gray"}>{STATUS_LABEL[status]}</Badge>
      </div>

      {due && (
        <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm">
          {due === "TERLAMBAT" ? "Jadwal perawatan terlambat" : "Perawatan berikutnya segera"}: {fmtDateLong(nextDue!)}.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Info title="Nilai perolehan" value={fmtRp(Number(asset.acquisitionCost))} hint={`Diperoleh ${fmtDateLong(asset.acquiredAt)}`} />
        <Info
          title="Nilai buku" value={fmtRp(dep.bookValue)}
          hint={dep.depreciable
            ? `Akumulasi penyusutan ${fmtRp(dep.accumulated)} (${dep.months} dari ${asset.usefulLifeMonths} bulan)`
            : "Tidak disusutkan"}
        />
        <Info title="Biaya perawatan" value={fmtRp(totalMaint)} hint={`${asset.maintenance.length} catatan`} />
      </div>

      {terminal && (
        <Card>
          <CardHeader><CardTitle>{asset.status === "DIJUAL" ? "Aset dijual" : "Aset dihapuskan"}</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <p>{fmtDateLong(asset.disposedAt!)}{asset.status === "DIJUAL" && ` · hasil ${fmtRp(Number(asset.disposalValue ?? 0))}`}</p>
            {gain !== null && <p className="text-muted-foreground">{gain >= 0 ? "Laba" : "Rugi"} pelepasan {fmtRp(Math.abs(gain))} terhadap nilai buku {fmtRp(dep.bookValue)}.</p>}
            {asset.notes && <p className="mt-2 whitespace-pre-line text-muted-foreground">{asset.notes}</p>}
          </CardContent>
        </Card>
      )}

      {!terminal && canEdit && (
        <Card>
          <CardHeader><CardTitle>Status dan lokasi</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-end gap-6">
            <StatusForm id={asset.id} status={asset.status} />
            <MoveForm id={asset.id} location={asset.location ?? ""} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Penugasan</CardTitle>
          <p className="text-sm text-muted-foreground">{open ? `Dipegang ${open.assignee} sejak ${fmtDateLong(open.assignedAt)}` : "Tidak sedang ditugaskan"}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {canEdit && !terminal && (open ? <ReturnForm id={asset.id} today={todayStr} /> : status === "AKTIF" ? <AssignForm id={asset.id} today={todayStr} /> : (
            <p className="text-sm text-muted-foreground">Aset harus berstatus Aktif untuk ditugaskan.</p>
          ))}
          <Table>
            <THead><TR><TH>Penanggung jawab</TH><TH>Sejak</TH><TH>Kembali</TH><TH>Catatan</TH></TR></THead>
            <TBody>
              {asset.assignments.length === 0 && <TR><TD colSpan={4} className="py-6 text-center text-muted-foreground">Belum ada penugasan.</TD></TR>}
              {asset.assignments.map((a) => (
                <TR key={a.id}>
                  <TD>{a.assignee}</TD>
                  <TD className="whitespace-nowrap">{fmtDateLong(a.assignedAt)}</TD>
                  <TD className="whitespace-nowrap">{a.returnedAt ? fmtDateLong(a.returnedAt) : "Masih dipegang"}</TD>
                  <TD className="text-muted-foreground">{a.note ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Riwayat perawatan dan servis</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {canEdit && !terminal && <MaintenanceForm id={asset.id} today={todayStr} />}
          <Table>
            <THead>
              <TR><TH>Tanggal</TH><TH>Jenis</TH><TH>Uraian</TH><TH>Vendor</TH><TH className="text-right">Biaya</TH><TH>Berikutnya</TH>{canDelete && <TH />}</TR>
            </THead>
            <TBody>
              {asset.maintenance.length === 0 && <TR><TD colSpan={canDelete ? 7 : 6} className="py-6 text-center text-muted-foreground">Belum ada catatan perawatan.</TD></TR>}
              {asset.maintenance.map((m) => (
                <TR key={m.id}>
                  <TD className="whitespace-nowrap">{fmtDateLong(m.performedAt)}</TD>
                  <TD>{MAINTENANCE_LABEL[m.type as MaintenanceTypeName]}</TD>
                  <TD>{m.description}</TD>
                  <TD className="text-muted-foreground">{m.vendor ?? "—"}</TD>
                  <TD className="text-right tabular-nums">{fmtRp(Number(m.cost))}</TD>
                  <TD className="whitespace-nowrap">{m.nextDueAt ? fmtDateLong(m.nextDueAt) : "—"}</TD>
                  {canDelete && <TD><DeleteMaintenanceForm id={asset.id} maintenanceId={m.id} /></TD>}
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {!terminal && canEdit && (
        <Card>
          <CardHeader><CardTitle>Data aset</CardTitle></CardHeader>
          <CardContent>
            <AssetEditForm
              id={asset.id}
              d={{
                name: asset.name, brand: asset.brand ?? "", serialNumber: asset.serialNumber ?? "", location: asset.location ?? "",
                acquiredAt: dateIn(asset.acquiredAt), cost: String(Number(asset.acquisitionCost)), salvage: String(Number(asset.salvageValue)),
                lifeMonths: String(asset.usefulLifeMonths), notes: asset.notes ?? "",
              }}
            />
          </CardContent>
        </Card>
      )}

      {!terminal && canDispose && (
        <Card>
          <CardHeader>
            <CardTitle>Lepas aset</CardTitle>
            <p className="text-sm text-muted-foreground">Dijual atau dihapuskan. Penyusutan berhenti pada tanggal pelepasan.</p>
          </CardHeader>
          <CardContent><DisposeForm id={asset.id} today={todayStr} /></CardContent>
        </Card>
      )}

      {canDelete && asset.maintenance.length === 0 && asset.assignments.length === 0 && (
        <div><DeleteAssetForm id={asset.id} /></div>
      )}
    </div>
  );
}

function Info({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
