"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createOrderAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { TermsEditor } from "@/components/terms-editor";
import { DEFAULT_TERMS, toRows, type OrderAmounts, type TermRow } from "@/lib/billing";
import { fmtNum } from "@/lib/format";

type Line = { id: string; description: string; qty: number; unit: string; unitPrice: number; productId: string | null };
type Product = { id: string; code: string; name: string };

export function OrderForm({
  source, sourceId, lines, products, order, needTerms, defaultDate, defaultDue, backHref,
}: {
  source: "penawaran" | "proyek"; sourceId: string; lines: Line[]; products: Product[]; order: OrderAmounts;
  needTerms: boolean; defaultDate: string; defaultDue: string; backHref: string;
}) {
  const [state, action, pending] = useActionState(createOrderAction, undefined);
  const [terms, setTerms] = useState<TermRow[]>(toRows(DEFAULT_TERMS));
  const [map, setMap] = useState<Record<string, string>>({});
  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="sourceId" value={sourceId} />
      <input type="hidden" name="productIds" value={JSON.stringify(map)} />
      {needTerms && <input type="hidden" name="terms" value={JSON.stringify(terms)} />}

      <Card>
        <CardHeader><CardTitle>Barang pesanan</CardTitle>
          {source === "penawaran" && <p className="text-sm text-muted-foreground">Setiap barang harus terkait ke barang jadi di katalog agar proyek produksinya bisa dibuat.</p>}
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {lines.map((l) => (
            <div key={l.id} className="grid items-center gap-2 sm:grid-cols-[1fr_6rem_8rem_16rem]">
              <span className="text-sm font-medium">{l.description}</span>
              <span className="text-sm tabular-nums">{l.qty} {l.unit}</span>
              <span className="text-sm tabular-nums text-muted-foreground">{fmtNum(l.unitPrice)}</span>
              {source === "penawaran" && !l.productId ? (
                <Select aria-label={`Barang katalog untuk ${l.description}`} value={map[l.id] ?? ""} required onChange={(e) => setMap({ ...map, [l.id]: e.target.value })}>
                  <option value="" disabled>Pilih barang jadi…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </Select>
              ) : <span className="text-xs text-muted-foreground">{source === "penawaran" ? "Sudah terkait katalog" : ""}</span>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Informasi pesanan</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5"><Label htmlFor="date">Tanggal KO</Label><Input id="date" name="date" type="date" defaultValue={defaultDate} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="dueDate">Estimasi pengiriman</Label><Input id="dueDate" name="dueDate" type="date" defaultValue={defaultDue} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="workDays">Waktu pengerjaan (hari kerja)</Label><Input id="workDays" name="workDays" inputMode="numeric" placeholder="14" /></div>
          <div className="flex flex-col gap-1.5 sm:col-span-3"><Label htmlFor="deliveryLocation">Lokasi kirim</Label><Input id="deliveryLocation" name="deliveryLocation" maxLength={300} /></div>
          <div className="flex flex-col gap-1.5 sm:col-span-3">
            <Label htmlFor="notes">Catatan (satu per baris)</Label>
            <Textarea id="notes" name="notes" maxLength={1000} placeholder={"Harga sudah termasuk ongkos kirim.\nPerubahan spesifikasi setelah konfirmasi dapat mengubah harga dan jadwal."} />
          </div>
        </CardContent>
      </Card>

      {needTerms && (
        <Card>
          <CardHeader><CardTitle>Termin pembayaran</CardTitle></CardHeader>
          <CardContent><TermsEditor rows={terms} onChange={setTerms} order={order} /></CardContent>
        </Card>
      )}
      {state?.error && <p role="alert" className="text-sm font-medium">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Membuat…" : "Terbitkan Konfirmasi Order"}</Button>
        <Button asChild variant="outline"><Link href={backHref}>Batal</Link></Button>
      </div>
    </form>
  );
}
