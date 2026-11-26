import Link from "next/link";
import { cn } from "@/lib/utils";

/** Tab berbasis tautan (state di URL), gaya shadcn Tabs. */
export function TabsNav({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <div className="inline-flex rounded-lg bg-muted p-1 text-sm">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={cn(
            "rounded-md px-3 py-1.5 font-medium",
            i.active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}
