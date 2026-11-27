import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default async function PelangganPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePermission("order");
  const q = (await searchParams).q?.trim() ?? "";
  const customers = await db.customer.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { contact: { contains: q, mode: "insensitive" } }] } : {},
    orderBy: { name: "asc" },
    include: { _count: { select: { projects: true } } },
  });
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pelanggan</h1>
          <p className="text-sm text-muted-foreground">Dipakai bersama oleh GTF dan SBA</p>
        </div>
        {can(user.role, "order", "create") && <Button asChild><Link href="/pelanggan/baru">+ Pelanggan</Link></Button>}
      </div>
      <form className="w-72"><Input name="q" defaultValue={q} placeholder="Cari pelanggan…" aria-label="Cari pelanggan" /></form>
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>Nama</TH><TH>Kontak</TH><TH>Telepon</TH><TH className="text-right">Proyek</TH><TH>Status</TH></TR></THead>
            <TBody>
              {customers.length === 0 && <TR><TD colSpan={5} className="py-8 text-center text-muted-foreground">Belum ada pelanggan.</TD></TR>}
              {customers.map((c) => (
                <TR key={c.id}>
                  <TD><Link href={`/pelanggan/${c.id}`} className="hover:underline">{c.name}</Link></TD>
                  <TD>{c.contact ?? "—"}</TD>
                  <TD>{c.phone ?? "—"}</TD>
                  <TD className="text-right tabular-nums">{c._count.projects}</TD>
                  <TD><Badge dot={c.active ? "green" : "gray"}>{c.active ? "Aktif" : "Nonaktif"}</Badge></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
