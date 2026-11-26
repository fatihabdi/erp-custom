import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { allowedModules, can, ROLE_LABEL } from "@/lib/permissions";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

const MENU: Record<string, string> = {
  dashboard: "Dashboard",
  penawaran: "Penawaran",
  order: "Konfirmasi Order",
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
const READY = new Set(["dashboard", "penawaran", "order", "proyek", "inventory", "invoice", "kwitansi", "pengguna", "pengaturan"]);

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const modules = allowedModules(user.role);
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border p-4">
        <div className="px-2 pb-4 text-lg font-semibold">ERP Furniture</div>
        <nav className="flex flex-1 flex-col gap-1">
          {modules.map((m) =>
            READY.has(m) ? (
              <Link key={m} href={`/${m}`} className="rounded-lg px-3 py-2 text-sm hover:bg-muted">
                {MENU[m]}
              </Link>
            ) : (
              <span key={m} className="rounded-lg px-3 py-2 text-sm text-muted-foreground">
                {MENU[m]}
              </span>
            ),
          )}
          {can(user.role, "order", "view") && (
            <Link href="/pelanggan" className="rounded-lg px-3 py-2 text-sm hover:bg-muted">Pelanggan</Link>
          )}
        </nav>
        <div className="border-t border-border pt-3 text-sm">
          <div className="font-medium">{user.name}</div>
          <div className="text-muted-foreground">{ROLE_LABEL[user.role]}</div>
          <form action={logout} className="mt-2">
            <Button variant="outline" size="sm" type="submit" className="w-full">Keluar</Button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
