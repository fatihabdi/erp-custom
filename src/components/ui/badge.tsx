import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Badge shadcn (Default, Secondary, Outline, Destructive).
// Untuk status dipakai outline + titik berwarna: abu = belum, hitam = berjalan,
// hijau = selesai, kuning = perlu perhatian, merah = masalah.
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-muted text-foreground",
        outline: "border-border text-foreground",
        destructive: "border-transparent bg-destructive text-white",
      },
    },
    defaultVariants: { variant: "outline" },
  },
);

export type StatusTone = "gray" | "black" | "green" | "amber" | "red";
const DOT: Record<StatusTone, string> = {
  gray: "bg-zinc-300",
  black: "bg-foreground",
  green: "bg-success",
  amber: "bg-warning",
  red: "bg-destructive",
};

export function Badge({
  className, variant, dot, children, ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants> & { dot?: StatusTone }) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT[dot])} />}
      {children}
    </span>
  );
}
