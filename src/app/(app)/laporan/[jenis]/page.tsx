import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { BUILDERS } from "@/lib/report/build";
import { reportContext, type ReportQuery } from "@/lib/report/context";
import { periodPresets } from "@/lib/report/filters";
import { isReportSlug, REPORTS } from "@/lib/report/types";
import { ReportView } from "@/components/report-view";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { TabsNav } from "@/components/ui/tabs-nav";

export default async function LaporanDetailPage({ params, searchParams }: { params: Promise<{ jenis: string }>; searchParams: Promise<ReportQuery> }) {
  const user = await requirePermission("laporan");
  const { jenis } = await params;
  if (!isReportSlug(jenis)) notFound();
  const sp = await searchParams;
  const meta = REPORTS.find((r) => r.slug === jenis)!;
  const ctx = await reportContext(user, sp);
  const data = ctx.scope.selected.length > 0 ? await BUILDERS[jenis](ctx) : null;

  const qs = (extra: Record<string, string> = {}) => {
    const q = new URLSearchParams(Object.entries({ dari: ctx.period.fromStr, sampai: ctx.period.toStr, pt: ctx.scope.value, ...extra }).filter(([, v]) => v) as [string, string][]);
    return q.toString();
  };
  const tabQuery = qs();

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{meta.short}</h1>
          <p className="text-sm text-muted-foreground">{meta.description}</p>
        </div>
        {data && (
          <div className="flex gap-2">
            <Button asChild variant="outline"><a href={`/api/laporan/${jenis}?${qs({ format: "xlsx" })}`}><Download className="size-4" aria-hidden />Excel</a></Button>
            <Button asChild variant="outline"><a href={`/api/laporan/${jenis}?${qs({ format: "pdf" })}`}><Download className="size-4" aria-hidden />PDF</a></Button>
          </div>
        )}
      </div>

      <TabsNav items={REPORTS.map((r) => ({ href: `/laporan/${r.slug}${tabQuery ? `?${tabQuery}` : ""}`, label: r.title, active: r.slug === jenis }))} />

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        {meta.period ? (
          <>
            <div className="flex flex-col gap-1.5"><Label htmlFor="dari">Dari</Label><Input id="dari" type="date" name="dari" defaultValue={ctx.period.fromStr} className="w-40" /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="sampai">Sampai</Label><Input id="sampai" type="date" name="sampai" defaultValue={ctx.period.toStr} className="w-40" /></div>
          </>
        ) : (
          <p className="self-center text-sm text-muted-foreground">Laporan ini menunjukkan posisi hari ini, jadi tidak memakai filter periode.</p>
        )}
        {ctx.scope.options.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pt">Perusahaan</Label>
            <Select id="pt" name="pt" defaultValue={ctx.scope.value} className="w-40">
              {ctx.scope.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
        ) : ctx.scope.options[0] && <input type="hidden" name="pt" value={ctx.scope.options[0].value} />}
        <Button type="submit">Terapkan</Button>
        {meta.period && (
          <div className="flex flex-wrap items-center gap-1 text-sm">
            {periodPresets().map((p) => {
              const q = new URLSearchParams({ dari: p.dari, sampai: p.sampai, ...(ctx.scope.value ? { pt: ctx.scope.value } : {}) }).toString();
              return <Link key={p.label} href={`/laporan/${jenis}?${q}`} className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">{p.label}</Link>;
            })}
          </div>
        )}
      </form>

      {data ? (
        <>
          <p className="text-sm text-muted-foreground">Perusahaan: <span className="font-medium text-foreground">{data.scopeLabel}</span> · {meta.period ? "Periode" : ""} <span className="font-medium text-foreground">{data.periodLabel}</span></p>
          <ReportView data={data} />
        </>
      ) : (
        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">Akun ini belum terhubung ke perusahaan mana pun.</p>
      )}
    </div>
  );
}
