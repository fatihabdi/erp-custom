import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Kartu ringkasan: judul, angka besar, keterangan (merah/kuning bila perlu perhatian). */
export function StatCard({ title, value, hint, icon, tone }: { title: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: "red" | "amber" }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-normal leading-5">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        {hint && <p className={cn("mt-1 truncate text-xs text-muted-foreground", tone === "red" && "text-destructive", tone === "amber" && "text-warning")}>{hint}</p>}
      </CardContent>
    </Card>
  );
}
