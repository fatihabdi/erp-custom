import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { REPORTS } from "@/lib/report/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LaporanPage() {
  await requirePermission("laporan");
  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Laporan</h1>
        <p className="text-sm text-muted-foreground">Ditampilkan di layar dan bisa diekspor ke Excel atau PDF</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Link key={r.slug} href={`/laporan/${r.slug}`} className="group focus-visible:outline-none">
            <Card className="h-full transition-colors group-hover:bg-muted/40 group-focus-visible:ring-2 group-focus-visible:ring-ring/50">
              <CardHeader className="flex-row items-start justify-between gap-2 pb-2">
                <CardTitle className="text-base">{r.short}</CardTitle>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{r.description}</p>
                <p className="mt-3 text-xs text-muted-foreground">{r.period ? "Memakai filter periode" : "Posisi hari ini"}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
