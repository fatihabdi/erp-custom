import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { allowedModules, can, ROLE_LABEL } from "@/lib/permissions";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { SidebarNav, Topbar, type NavItem } from "@/components/app-nav";

const MENU: Record<string, string> = {
  dashboard: "Dashboard",
  penawaran: "Penawaran",
  order: "Konfirmasi Order",
  "sales-order": "Sales Order",
  proyek: "Proyek",
  inventory: "Stok",
  invoice: "Invoice",
  kwitansi: "Kwitansi",
  aset: "Aset",
  laporan: "Laporan",
  pengguna: "Pengguna",
  pengaturan: "Pengaturan",
};

// Hanya modul yang sudah ada halamannya yang ditautkan.
const READY = new Set(["dashboard", "penawaran", "order", "sales-order", "proyek", "inventory", "invoice", "kwitansi", "aset", "pengguna", "pengaturan"]);

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const modules = allowedModules(user.role);
  const items: NavItem[] = modules.map((m) => ({ key: m, href: `/${m}`, label: MENU[m], ready: READY.has(m) }));
  if (can(user.role, "order", "view")) items.push({ key: "pelanggan", href: "/pelanggan", label: "Pelanggan", ready: true });
  const initials = user.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="flex items-center gap-3 p-4 pb-5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">EF</div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">ERP Furniture</div>
            <div className="text-xs text-muted-foreground">{user.companies.length > 0 ? user.companies.map((c) => c.code).join(" & ") : "GTF & SBA"}</div>
          </div>
        </div>
        <SidebarNav items={items} />
        <div className="flex items-center gap-3 border-t border-border p-4">
          <div className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold">{initials}</div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</div>
          </div>
          <form action={logout}>
            <Button variant="ghost" size="sm" type="submit" className="h-8 px-2" aria-label="Keluar" title="Keluar"><LogOut className="size-4" aria-hidden /></Button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
