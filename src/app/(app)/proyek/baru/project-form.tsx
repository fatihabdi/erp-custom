"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createProjectAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { orderTotals } from "@/lib/production";
import { fmtRp } from "@/lib/format";

type Company = { id: string; code: string; name: string; ppnRate: number };
type Customer = { id: string; name: string };
type Product = { id: string; code: string; name: string; unit: string };
type Line = { productId: string; qty: string; unitPrice: string };

const parseRp = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;

export function ProjectForm({
  kind, companies, customers, products, defaultCustomerId,
}: {
  kind: "ORDER" | "STOK"; companies: Company[]; customers: Customer[]; products: Product[]; defaultCustomerId?: string;
}) {
  const [state, action, pending] = useActionState(createProjectAction, undefined);
  const [lines, setLines] = useState<Line[]>([{ productId: products[0]?.id ?? "", qty: "1", unitPrice: "" }]);
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const order = kind === "ORDER";
  const company = companies.find((c) => c.id === companyId);
  const totals = orderTotals(
    lines.map((l) => ({ qty: Number(l.qty) || 0, unitPrice: parseRp(l.unitPrice) })),
    order ? (company?.ppnRate ?? 0) : 0,
  );
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="lines" value={JSON.stringify(lines.map((l) => ({
        productId: l.productId, qty: l.qty, unitPrice: order ? l.unitPrice || "0" : undefined,
      })))} />
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="name">{order ? "Nama proyek" : "Nama produksi"}</Label>
        <Input id="name" name="name" required maxLength={160} placeholder={order ? "mis. Meja & Kursi Siswa SD Contoh Harapan" : "mis. Stok Meja Guru"} />
      </div>
      {order && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="companyId">Perusahaan</Label>
            <Select id="companyId" name="companyId" value={companyId} onChange={(e) => setCompanyId(e.target.value)} required>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.code} · {c.ppnRate > 0 ? `PPN ${c.ppnRate}%` : "Non-PPN"}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customerId">Pelanggan</Label>
            <Select id="customerId" name="customerId" defaultValue={defaultCustomerId ?? ""} required>
              <option value="" disabled>Pilih pelanggan…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Link href="/pelanggan/baru?next=/proyek/baru" className="text-xs text-muted-foreground hover:underline">+ Pelanggan baru</Link>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="orderRef">Nomor KO / PO pelanggan</Label>
            <Input id="orderRef" name="orderRef" maxLength={60} placeholder="opsional" />
          </div>
        </>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="orderDate">{order ? "Tanggal order" : "Tanggal mulai"}</Label>
        <Input id="orderDate" name="orderDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dueDate">{order ? "Estimasi selesai kirim" : "Target selesai"}</Label>
        <Input id="dueDate" name="dueDate" type="date" />
      </div>

      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label>Barang</Label>
        {lines.map((l, i) => (
          <div key={i} className={`grid items-center gap-2 ${order ? "grid-cols-[1fr_5rem_9rem_auto]" : "grid-cols-[1fr_5rem_auto]"}`}>
            <Select aria-label="Barang jadi" value={l.productId} onChange={(e) => set(i, { productId: e.target.value })} required>
              {products.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </Select>
            <Input aria-label="Jumlah" inputMode="numeric" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} required />
            {order && <Input aria-label="Harga satuan (tanpa PPN)" inputMode="decimal" placeholder="Harga satuan" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} />}
            <Button type="button" variant="ghost" size="sm" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Hapus</Button>
          </div>
        ))}
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { productId: products[0]?.id ?? "", qty: "1", unitPrice: "" }])}>+ Tambah barang</Button>
        </div>
        {products.length === 0 && <p className="text-sm font-medium">Belum ada barang jadi. Tambahkan dulu di menu Stok.</p>}
      </div>

      {order && (
        <dl className="grid gap-1 rounded-lg border border-border p-3 text-sm sm:col-span-2">
          <div className="flex justify-between"><dt className="text-muted-foreground">Nilai (tanpa PPN)</dt><dd className="tabular-nums">{fmtRp(totals.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">PPN {company?.ppnRate ?? 0}%</dt><dd className="tabular-nums">{fmtRp(totals.ppn)}</dd></div>
          <div className="flex justify-between font-medium"><dt>Total</dt><dd className="tabular-nums">{fmtRp(totals.total)}</dd></div>
        </dl>
      )}

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="notes">Catatan</Label>
        <Input id="notes" name="notes" maxLength={500} />
      </div>
      {state?.error && <p role="alert" className="text-sm font-medium sm:col-span-2">{state.error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending || products.length === 0}>{pending ? "Menyimpan…" : order ? "Buat proyek" : "Buat order produksi"}</Button>
        <Button asChild variant="outline"><Link href="/proyek">Batal</Link></Button>
      </div>
    </form>
  );
}
