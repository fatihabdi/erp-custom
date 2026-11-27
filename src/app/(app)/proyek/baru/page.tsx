import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createModuleFor } from "@/lib/production";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectForm } from "./project-form";

export default async function ProyekBaruPage({ searchParams }: { searchParams: Promise<{ jenis?: string; pelanggan?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const kind = sp.jenis === "stok" ? "STOK" : "ORDER";
  if (!can(user.role, createModuleFor(kind), "create")) redirect("/dashboard?akses=ditolak");

  const [companies, customers, products] = await Promise.all([
    db.company.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    db.customer.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.item.findMany({ where: { kind: "FINISHED", active: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, unit: true } }),
  ]);
  // Pengguna yang dibatasi ke perusahaan tertentu hanya melihat perusahaannya.
  const allowed = user.companies.length > 0 ? companies.filter((c) => user.companies.some((u) => u.id === c.id)) : companies;
  const order = kind === "ORDER";
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{order ? "Proyek baru" : "Order produksi internal"}</h1>
        <p className="text-sm text-muted-foreground">
          {order ? "Pesanan pelanggan. PPN mengikuti perusahaan." : "Produksi untuk stok, tanpa pelanggan. Hasil QC lulus masuk stok barang jadi."}
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle>{order ? "Data pesanan" : "Data produksi"}</CardTitle></CardHeader>
        <CardContent>
          <ProjectForm
            kind={kind}
            companies={allowed.map((c) => ({ id: c.id, code: c.code, name: c.name, ppnRate: Number(c.ppnRate) }))}
            customers={customers}
            products={products}
            defaultCustomerId={sp.pelanggan}
          />
        </CardContent>
      </Card>
    </div>
  );
}
