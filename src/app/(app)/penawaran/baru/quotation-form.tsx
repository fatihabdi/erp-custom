"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveQuotationAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { TermsEditor } from "@/components/terms-editor";
import { DEFAULT_TERMS, orderAmounts, toRows, type TermRow } from "@/lib/billing";
import { fmtRpFull } from "@/lib/format";
import { terbilangRupiah } from "@/lib/terbilang";

type Company = { id: string; code: string; name: string; ppnRate: number };
type Customer = { id: string; name: string };
type Product = { id: string; code: string; name: string; unit: string };
type Line = { description: string; spec: string; qty: string; unit: string; unitPrice: string; productId: string };

export type QuotationInitial = {
  id: string; number: string; companyId: string; date: string; customerId: string; attn: string; subject: string; notes: string;
  lines: Line[]; terms: TermRow[];
};

const parseRp = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;
const blank = (): Line => ({ description: "", spec: "", qty: "1", unit: "Unit", unitPrice: "", productId: "" });

export function QuotationForm({
  companies, customers, products, initial, defaultDate, defaultCustomerId,
}: { companies: Company[]; customers: Customer[]; products: Product[]; initial?: QuotationInitial; defaultDate: string; defaultCustomerId?: string }) {
  const [state, action, pending] = useActionState(saveQuotationAction, undefined);
  const [companyId, setCompanyId] = useState(initial?.companyId ?? companies[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>(initial?.lines ?? [blank()]);
  const [terms, setTerms] = useState<TermRow[]>(initial?.terms ?? toRows(DEFAULT_TERMS));
  const company = companies.find((c) => c.id === companyId);
  const order = orderAmounts(lines.map((l) => ({ qty: Number(l.qty) || 0, unitPrice: parseRp(l.unitPrice) })), company?.ppnRate ?? 0);
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pick = (i: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    set(i, p ? { productId, description: lines[i].description || p.name, unit: p.unit } : { productId: "" });
  };

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_17rem]">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <input type="hidden" name="terms" value={JSON.stringify(terms)} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader><CardTitle>Informasi penawaran</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="companyId">Perusahaan</Label>
              <Select id="companyId" name="companyId" value={companyId} disabled={!!initial} onChange={(e) => setCompanyId(e.target.value)} required>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.ppnRate > 0 ? `PPN ${c.ppnRate}%` : "Non-PPN"}</option>)}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="date">Tanggal terbit</Label>
              <Input id="date" name="date" type="date" defaultValue={initial?.date ?? defaultDate} disabled={!!initial} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="number">No. dokumen</Label>
              <Input id="number" value={initial?.number ?? "Otomatis saat disimpan"} disabled readOnly />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customerId">Pelanggan</Label>
              <Select id="customerId" name="customerId" defaultValue={initial?.customerId ?? defaultCustomerId ?? ""} required>
                <option value="" disabled>Pilih pelanggan…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Link href="/pelanggan/baru?next=/penawaran/baru" className="text-xs text-muted-foreground hover:underline">+ Pelanggan baru</Link>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="attn">Kepada (u.p.)</Label>
              <Input id="attn" name="attn" maxLength={120} defaultValue={initial?.attn} placeholder="Bapak/Ibu Kepala Sekolah" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="subject">Perihal</Label>
              <Input id="subject" name="subject" maxLength={200} required defaultValue={initial?.subject} placeholder="Penawaran meja & kursi" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Barang</CardTitle>
            <p className="text-sm text-muted-foreground">Teks bebas. Kaitkan ke katalog barang agar bisa langsung menjadi proyek saat order dikonfirmasi.</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {lines.map((l, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(10rem,1fr)_4rem_5rem_8rem_auto]">
                <Input aria-label="Uraian" placeholder="Uraian barang" value={l.description} onChange={(e) => set(i, { description: e.target.value })} required />
                <Input aria-label="Jumlah" placeholder="Qty" inputMode="numeric" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} required />
                <Input aria-label="Satuan" placeholder="Satuan" value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} required />
                <Input aria-label="Harga satuan (tanpa PPN)" inputMode="decimal" placeholder="Harga satuan" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} required />
                <Button type="button" variant="ghost" size="sm" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Hapus</Button>
                <Input aria-label="Spesifikasi" className="sm:col-span-3" placeholder="Spesifikasi (opsional)" value={l.spec} onChange={(e) => set(i, { spec: e.target.value })} />
                <Select aria-label="Barang katalog" className="sm:col-span-2" value={l.productId} onChange={(e) => pick(i, e.target.value)}>
                  <option value="">Tidak dikaitkan ke katalog</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </Select>
              </div>
            ))}
            <div><Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blank()])}>+ Tambah barang</Button></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Termin pembayaran</CardTitle><p className="text-sm text-muted-foreground">DP, termin, atau lunas. Total harus 100%.</p></CardHeader>
          <CardContent><TermsEditor rows={terms} onChange={setTerms} order={order} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Catatan</CardTitle><p className="text-sm text-muted-foreground">Satu catatan per baris, tampil sebagai butir di PDF.</p></CardHeader>
          <CardContent>
            <Textarea name="notes" aria-label="Catatan" maxLength={1000} defaultValue={initial?.notes} placeholder={"Harga sudah termasuk ongkos kirim dan pemasangan.\nWaktu pengerjaan 14 hari kerja setelah DP diterima."} />
          </CardContent>
        </Card>
      </div>

      <aside className="flex h-fit flex-col gap-3 lg:sticky lg:top-6">
        <Card>
          <CardHeader><CardTitle>Ringkasan</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{fmtRpFull(order.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">PPN {company?.ppnRate ?? 0}%</span><span className="tabular-nums">{fmtRpFull(order.ppn)}</span></div>
            <div className="flex justify-between border-t border-border pt-2 font-semibold"><span>Total</span><span className="tabular-nums">{fmtRpFull(order.total)}</span></div>
            <p className="text-xs text-muted-foreground">Terbilang: {terbilangRupiah(order.total)}</p>
          </CardContent>
        </Card>
        {state?.error && <p role="alert" className="text-sm font-medium">{state.error}</p>}
        <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : initial ? "Simpan perubahan" : "Simpan draf"}</Button>
        <Button asChild variant="outline"><Link href={initial ? `/penawaran/${initial.id}` : "/penawaran"}>Batal</Link></Button>
      </aside>
    </form>
  );
}
