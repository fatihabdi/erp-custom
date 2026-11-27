import { cellText, isNumeric } from "@/lib/report/cell";
import type { ReportData } from "@/lib/report/types";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

/** Tampilan laporan di layar. Struktur sama dengan yang diekspor ke Excel dan PDF. */
export function ReportView({ data }: { data: ReportData }) {
  return (
    <div className="flex flex-col gap-6">
      {data.summary.length > 0 && (
        <div className={cn("grid gap-4 sm:grid-cols-2", data.summary.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
          {data.summary.map((s) => <StatCard key={s.label} title={s.label} value={cellText(s.value, s.type)} hint={s.hint} tone={s.tone} />)}
        </div>
      )}
      {data.sections.map((s) => (
        <Card key={s.title}>
          <CardHeader className="pb-3">
            <CardTitle>{s.title}</CardTitle>
            {s.note && <p className="text-sm text-muted-foreground">{s.note}</p>}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>{s.cols.map((c) => <TH key={c.key} className={cn(isNumeric(c.type) && "text-right")}>{c.label}</TH>)}</TR>
              </THead>
              <TBody>
                {s.rows.length === 0 && <TR><TD colSpan={s.cols.length} className="py-8 text-center text-muted-foreground">{s.empty ?? "Tidak ada data."}</TD></TR>}
                {s.rows.map((r, i) => (
                  <TR key={i}>
                    {s.cols.map((c) => (
                      <TD key={c.key} className={cn("tabular-nums", isNumeric(c.type) ? "whitespace-nowrap text-right" : (c.type === "date" || c.key === "state" || c.key === "project" || c.key === "number") && "whitespace-nowrap", c.type === "rp" && Number(r[c.key]) < 0 && "text-destructive")}>
                        {cellText(r[c.key], c.type)}
                      </TD>
                    ))}
                  </TR>
                ))}
                {s.totals && s.rows.length > 0 && (
                  <TR className="bg-muted/40 font-semibold hover:bg-muted/40">
                    {s.cols.map((c) => (
                      <TD key={c.key} className={cn("tabular-nums", isNumeric(c.type) && "whitespace-nowrap text-right", c.type === "rp" && Number(s.totals![c.key]) < 0 && "text-destructive")}>
                        {cellText(s.totals![c.key], c.type)}
                      </TD>
                    ))}
                  </TR>
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
