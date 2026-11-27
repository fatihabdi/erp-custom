"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote, Box, Package, ChartColumn, ClipboardCheck, ClipboardList, FileText, Layers, LayoutDashboard,
  Receipt, SlidersHorizontal, Truck, UserCog, Users, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "@/components/global-search";

export type NavItem = { key: string; href: string; label: string; ready: boolean };

const ICON: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard, penawaran: FileText, order: ClipboardCheck, "sales-order": ClipboardList, proyek: Layers, inventory: Box, produk: Package,
  invoice: Receipt, kwitansi: Banknote, aset: Truck, pelanggan: Users, pengaturan: SlidersHorizontal,
  laporan: ChartColumn, pengguna: UserCog,
};

const GROUPS: { title: string; keys: string[] }[] = [
  { title: "Menu", keys: ["dashboard", "penawaran", "order", "sales-order", "proyek", "inventory"] },
  { title: "Keuangan", keys: ["invoice", "kwitansi", "laporan"] },
  { title: "Data", keys: ["produk", "aset", "pelanggan", "pengguna", "pengaturan"] },
];

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
      {GROUPS.map((g) => {
        const list = g.keys.map((k) => items.find((i) => i.key === k)).filter((i): i is NavItem => !!i);
        if (list.length === 0) return null;
        return (
          <div key={g.title} className="flex flex-col gap-0.5">
            <div className="px-2 pb-1 text-xs text-muted-foreground">{g.title}</div>
            {list.map((i) => {
              const Icon = ICON[i.key];
              const cls = "flex h-9 items-center gap-3 rounded-md px-2.5 text-sm";
              return i.ready ? (
                <Link
                  key={i.key} href={i.href} aria-current={isActive(pathname, i.href) ? "page" : undefined}
                  className={cn(cls, isActive(pathname, i.href) ? "bg-accent font-medium" : "hover:bg-muted")}
                >
                  {Icon && <Icon className="size-4" aria-hidden />}{i.label}
                </Link>
              ) : (
                <span key={i.key} className={cn(cls, "text-muted-foreground")}>{Icon && <Icon className="size-4" aria-hidden />}{i.label}</span>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

const SEGMENT: Record<string, string> = {
  dashboard: "Dashboard", penawaran: "Penawaran", order: "Konfirmasi Order", "sales-order": "Sales Order", proyek: "Proyek", inventory: "Stok", produk: "Master Produk",
  invoice: "Invoice", kwitansi: "Kwitansi", aset: "Aset", pelanggan: "Pelanggan", pengaturan: "Pengaturan",
  pengguna: "Pengguna", laporan: "Laporan", penjualan: "Penjualan", piutang: "Piutang aging", kas: "Penerimaan kas", margin: "Margin proyek", termin: "DP & termin", ppn: "PPN keluaran", baru: "Buat baru", barang: "Barang", mutasi: "Mutasi", kategori: "Kategori",
};

export function Topbar({ searchable = true }: { searchable?: boolean }) {
  const pathname = usePathname();
  const segs = pathname.split("/").filter(Boolean);
  const crumbs = segs.map((s, i) => ({ label: SEGMENT[s] ?? "Detail", href: `/${segs.slice(0, i + 1).join("/")}`, last: i === segs.length - 1 }));
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        {crumbs.map((c, i) => (
          <span key={c.href} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted-foreground">/</span>}
            {c.last ? <span>{c.label}</span> : <Link href={c.href} className="text-muted-foreground hover:text-foreground">{c.label}</Link>}
          </span>
        ))}
      </nav>
      {searchable && <GlobalSearch />}
    </header>
  );
}
