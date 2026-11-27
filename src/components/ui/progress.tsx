import { cn } from "@/lib/utils";

/** Batang progres hitam-putih (gaya shadcn Progress). */
export function Progress({ value, className, tone = "default" }: { value: number; className?: string; tone?: "default" | "muted" | "amber" }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div className={cn("h-full rounded-full", tone === "muted" ? "bg-muted-foreground" : tone === "amber" ? "bg-warning" : "bg-primary")} style={{ width: `${v}%` }} />
    </div>
  );
}
