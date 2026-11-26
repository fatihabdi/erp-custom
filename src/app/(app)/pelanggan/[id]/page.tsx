import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerForm } from "../customer-form";

export default async function PelangganDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("order");
  const { id } = await params;
  const c = await db.customer.findUnique({
    where: { id },
    include: { projects: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, code: true, name: true, status: true } } },
  });
  if (!c) notFound();
  const canEdit = can(user.role, "order", "edit");
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground"><Link href="/pelanggan" className="hover:underline">Pelanggan</Link> / {c.name}</p>
        <h1 className="text-2xl font-semibold">{c.name}</h1>
      </div>
      <Card>
        <CardHeader><CardTitle>Data pelanggan</CardTitle></CardHeader>
        <CardContent>
          {canEdit ? (
            <CustomerForm customer={{
              id: c.id, name: c.name, contact: c.contact ?? "", phone: c.phone ?? "", email: c.email ?? "",
              address: c.address ?? "", taxId: c.taxId ?? "", notes: c.notes ?? "", active: c.active,
            }} />
          ) : (
            <dl className="grid gap-2 text-sm">
              {([["Kontak", c.contact], ["Telepon", c.phone], ["Email", c.email], ["Alamat", c.address], ["NPWP", c.taxId]] as const).map(([k, v]) => (
                <div key={k} className="flex gap-3"><dt className="w-20 text-muted-foreground">{k}</dt><dd>{v ?? "—"}</dd></div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Proyek</CardTitle></CardHeader>
        <CardContent>
          {c.projects.length === 0 && <p className="text-sm text-muted-foreground">Belum ada proyek.</p>}
          <ul className="flex flex-col">
            {c.projects.map((p) => (
              <li key={p.id} className="border-b border-border py-2 text-sm last:border-0">
                <Link href={`/proyek/${p.id}`} className="hover:underline">{p.code} · {p.name}</Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
