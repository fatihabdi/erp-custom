import Link from "next/link";
import { Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assetScope } from "@/lib/asset-scope";
import {
  ASSET_TYPES, STATUS_LABEL, TYPE_LABEL, depreciation, dueState, isTerminal, wibDay,
  type AssetStatusName, type AssetTypeName,
} from "@/lib/asset";
import { fmtDateLong, fmtRp } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TabsNav } from "@/components/ui/tabs-nav";

type SP = { jenis?: string; pt?: string; status?: string; q?: string };

export default async function AsetPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("aset");
  const sp = await searchParams;
  const jenis = ASSET_TYPES.find((t) => t === sp.jenis);
  const q = sp.q?.trim() ?? "";
  const companies = await db.company.findMany({ where: { active: true }, orderBy: { code: "asc" }, select: { id: true, code: true } });
  const pt = companies.find((c) => c.code === sp.pt);
  const statusFilter = sp.status ?? "";
  const today = wibDay();

  const assets = await db.asset.findMany({
    where: {
      AND: [
        assetScope(user),
        pt ? { companyId: pt.id } : {},
        jenis ? { category: { type: jenis } } : {},
        statusFilter === "lepas" ? { status: { in: ["DIJUAL", "DIHAPUSKAN"] } }
          : statusFilter in STATUS_LABEL ? { status: statusFilter as AssetStatusName }
          : { status: { notIn: ["DIJUAL", "DIHAPUSKAN"] } },
        q ? { OR: [
          { name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } },
          { serialNumber: { contains: q, mode: "insensitive" } }, { location: { contains: q, mode: "insensitive" } },
        ] } : {},
      ],
    },
    orderBy: { code: "asc" },
    include: {
      company: { select: { code: true } }, category: { select: { name: true, type: true } },
      maintenance: { orderBy: [{ performedAt: "desc" }, { createdAt: "desc" }], take: 1, select: { nextDueAt: true } },
      assignments: { where: { returnedAt: null }, take: 1, select: { assignee: true } },
    },
  });

  const rows = assets.map((a) => {
    const dep = depreciation({
      cost: Number(a.acquisitionCost), salvage: Number(a.salvageValue), lifeMonths: a.usefulLifeMonths,
      acquiredAt: a.acquiredAt, disposedAt: a.disposedAt, asOf: today,
    });
    const nextDue = isTerminal(a.status as AssetStatusName) ? null : a.maintenance[0]?.nextDueAt ?? null;
    return { a, dep, nextDue, due: dueState(nextDue, today) };
  });
  const live = rows.filter((r) => !isTerminal(r.a.status as AssetStatusName));
  const totalCost = live.reduce((n, r) => n + Number(r.a.acquisitionCost), 0);
  const totalBook = live.reduce((n, r) => n + r.dep.bookValue, 0);
  const overdue = rows.filter((r) => r.due === "TERLAMBAT").length;
  const soon = rows.filter((r) => r.due === "SEGERA").length;
  const canCreate = can(user.role, "aset", "create");

  const href = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    const m = { jenis: sp.jenis, pt: sp.pt, status: sp.status, q: sp.q, ...over };
    for (const [k, v] of Object.entries(m)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/aset?${s}` : "/aset";
  };

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Aset</h1>
          <p className="text-sm text-muted-foreground">Mesin, kendaraan, dan peralatan GTF dan SBA</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/aset/kategori">Kategori</Link></Button>
          {canCreate && <Button asChild><Link href="/aset/baru">+ Aset</Link></Button>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title="Aset terdaftar" value={String(live.length)} hint="Belum dijual atau dihapuskan" />
        <Stat title="Nilai perolehan" value={fmtRp(totalCost)} hint="Aset yang masih dimiliki" />
        <Stat title="Nilai buku" value={fmtRp(totalBook)} hint="Setelah penyusutan garis lurus" />
        <Stat title="Jadwal perawatan" value={String(overdue + soon)} hint={`${overdue} terlambat, ${soon} dalam 30 hari`} icon />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsNav
          items={[
            { href: href({ jenis: undefined }), label: "Semua", active: !jenis },
            ...ASSET_TYPES.map((t: AssetTypeName) => ({ href: href({ jenis: t }), label: TYPE_LABEL[t], active: jenis === t })),
          ]}
        />
        <form className="flex flex-wrap gap-2">
          {jenis && <input type="hidden" name="jenis" value={jenis} />}
          <Select name="pt" defaultValue={pt?.code ?? ""} aria-label="Perusahaan" className="w-28">
            <option value="">Semua PT</option>
            {companies.map((c) => <option key={c.id} value={c.code}>{c.code}</option>)}
          </Select>
          <Select name="status" defaultValue={statusFilter} aria-label="Status" className="w-44">
            <option value="">Belum dilepas</option>
            <option value="AKTIF">Aktif</option>
            <option value="PERAWATAN">Dalam perawatan</option>
            <option value="RUSAK">Rusak</option>
            <option value="lepas">Dijual / dihapuskan</option>
          </Select>
          <Input name="q" defaultValue={q} placeholder="Cari nama, kode, no. seri, lokasi…" aria-label="Cari aset" className="w-64" />
          <Button type="submit" variant="outline">Terapkan</Button>
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Kode</TH><TH>Nama aset</TH><TH>PT</TH><TH>Kategori</TH><TH>Lokasi / pemegang</TH>
                <TH className="text-right">Nilai perolehan</TH><TH className="text-right">Nilai buku</TH><TH>Perawatan</TH><TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.length === 0 && <TR><TD colSpan={9} className="py-8 text-center text-muted-foreground">Belum ada aset.</TD></TR>}
              {rows.map(({ a, dep, nextDue, due }) => (
                <TR key={a.id}>
                  <TD className="whitespace-nowrap">{a.code}</TD>
                  <TD><Link href={`/aset/${a.id}`} className="hover:underline">{a.name}</Link></TD>
                  <TD>{a.company.code}</TD>
                  <TD>{a.category.name}</TD>
                  <TD className="text-muted-foreground">
                    {a.assignments[0] ? `${a.assignments[0].assignee}${a.location ? ` · ${a.location}` : ""}` : a.location ?? "—"}
                  </TD>
                  <TD className="text-right tabular-nums">{fmtRp(Number(a.acquisitionCost))}</TD>
                  <TD className="text-right tabular-nums">{fmtRp(dep.bookValue)}</TD>
                  <TD className="whitespace-nowrap">
                    {nextDue ? (
                      <span className={due === "TERLAMBAT" ? "font-medium" : "text-muted-foreground"}>
                        {fmtDateLong(nextDue)}{due === "TERLAMBAT" ? " · terlambat" : ""}
                      </span>
                    ) : "—"}
                  </TD>
                  <TD>
                    <Badge dot={a.status === "AKTIF" ? "green" : a.status === "RUSAK" ? "red" : a.status === "PERAWATAN" ? "amber" : "gray"}>
                      {STATUS_LABEL[a.status as AssetStatusName]}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ title, value, hint, icon }: { title: string; value: string; hint: string; icon?: boolean }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon && <Wrench className="size-4 text-muted-foreground" aria-hidden />}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
