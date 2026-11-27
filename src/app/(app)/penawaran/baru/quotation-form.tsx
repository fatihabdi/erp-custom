"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveQuotationAction } from "../actions";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { TermsEditor } from "@/components/terms-editor";
import { DEFAULT_TERMS, noteLines, orderAmounts, termAmounts, toRows, type TermRow } from "@/lib/billing";
import { fmtNum, fmtRpFull } from "@/lib/format";
import { terbilangRupiah } from "@/lib/terbilang";

type Company = { id: string; code: string; name: string; ppnRate: number };
type Customer = { id: string; name: string };
type Product = { id: string; code: string; name: string; unit: string; price: number; spec: string; type: "PRODUKSI" | "DAGANG" };
type Line = { description: string; spec: string; qty: string; unit: string; unitPrice: string; productId: string };

export type QuotationInitial = {
  id: string; number: string; companyId: string; date: string; customerId: string; attn: string; subject: string; notes: string;
  lines: Line[]; terms: TermRow[];
};

const parseRp = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;
const blank = (): Line => ({ description: "", spec: "", qty: "1", unit: "Unit", unitPrice: "", productId: "" });

// Catatan bawaan: dipilih dengan kotak centang, lalu digabung dengan catatan tambahan (satu catatan per baris).
const NOTE_PRESETS = [
  { label: "Harga termasuk ongkos kirim", text: "Harga sudah termasuk ongkos kirim." },
  { label: "Termasuk pemasangan", text: "Harga sudah termasuk pemasangan." },
  { label: "Garansi 1 tahun", text: "Garansi 1 tahun." },
];
const splitNotes = (notes: string) => {
  const rest = noteLines(notes);
  const checked = NOTE_PRESETS.map((p) => rest.includes(p.text));
  return { checked, extra: rest.filter((l) => !NOTE_PRESETS.some((p) => p.text === l)).join("\n") };
};

// Sel isian tabel: tampak seperti teks biasa sampai disorot atau difokus.
const cell = "h-8 border-transparent bg-transparent px-2 shadow-none hover:border-input";
const ITEM_GRID = "grid grid-cols-[2rem_minmax(11rem,1fr)_4rem_5rem_7.5rem_7.5rem_2rem] items-start gap-2 px-3";

export function QuotationForm({
  companies, customers, products, initial, defaultDate, defaultCustomerId,
}: { companies: Company[]; customers: Customer[]; products: Product[]; initial?: QuotationInitial; defaultDate: string; defaultCustomerId?: string }) {
  const [state, action, pending] = useActionState(saveQuotationAction, undefined);
  const [companyId, setCompanyId] = useState(initial?.companyId ?? companies[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>(initial?.lines ?? [blank()]);
  const [terms, setTerms] = useState<TermRow[]>(initial?.terms ?? toRows(DEFAULT_TERMS));
  const initialNotes = splitNotes(initial?.notes ?? "");
  const [noteChecks, setNoteChecks] = useState<boolean[]>(initialNotes.checked);
  const [extraNotes, setExtraNotes] = useState(initialNotes.extra);
  const notes = [...NOTE_PRESETS.filter((_, i) => noteChecks[i]).map((p) => p.text), ...extraNotes.split("\n").map((l) => l.trim()).filter(Boolean)].join("\n");
  const company = companies.find((c) => c.id === companyId);
  const order = orderAmounts(lines.map((l) => ({ qty: Number(l.qty) || 0, unitPrice: parseRp(l.unitPrice) })), company?.ppnRate ?? 0);
  const termSums = termAmounts(order, terms.map((t) => Number(t.percent.replace(",", ".")) || 0));
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  // Memilih produk mengisi uraian, spesifikasi, satuan, dan harga dari katalog. Isian yang sudah diketik tidak ditimpa;
  // harga katalog hanya acuan dan tetap bisa diubah per penawaran.
  const pick = (i: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return set(i, { productId: "" });
    const prev = products.find((x) => x.id === lines[i].productId);
    const priceUntouched = !lines[i].unitPrice || (prev && parseRp(lines[i].unitPrice) === prev.price);
    set(i, {
      productId, unit: p.unit,
      description: lines[i].description || p.name,
      spec: lines[i].spec || p.spec,
      ...(priceUntouched ? { unitPrice: p.price > 0 ? fmtNum(p.price) : "" } : {}),
    });
  };
  const cancelHref = initial ? `/penawaran/${initial.id}` : "/penawaran";

  return (
    <form action={action} className="flex flex-col gap-6">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <input type="hidden" name="terms" value={JSON.stringify(terms)} />
      <input type="hidden" name="notes" value={notes} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{initial ? "Ubah penawaran" : "Penawaran baru"}</h1>
            <Badge dot="gray">Draf</Badge>
          </div>
          <p className="text-sm text-muted-foreground">GTF tanpa PPN, SBA dengan PPN 11% otomatis</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="ghost"><Link href={cancelHref}>Batal</Link></Button>
          <Button type="submit" name="intent" value="simpan" variant="secondary" disabled={pending}>{pending ? "Menyimpan…" : initial ? "Simpan perubahan" : "Simpan draf"}</Button>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>Informasi penawaran</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="companyId">Perusahaan</Label>
                <Select id="companyId" name="companyId" value={companyId} disabled={!!initial} onChange={(e) => setCompanyId(e.target.value)} required>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.code} ({c.ppnRate > 0 ? `PPN ${c.ppnRate}%` : "Non-PPN"})</option>)}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="date">Tanggal terbit</Label>
                <Input id="date" name="date" type="date" defaultValue={initial?.date ?? defaultDate} disabled={!!initial} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="number">No. dokumen (otomatis)</Label>
                <Input id="number" value={initial?.number ?? "Dibuat saat disimpan"} disabled readOnly />
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
            <CardContent className="flex flex-col gap-4 pt-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Item</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Pilih dari Master Produk (harga terisi otomatis, boleh diubah) atau ketik item custom tanpa katalog</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blank()])}>+ Tambah item</Button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <div className="min-w-[44rem]">
                  <div className={`${ITEM_GRID} h-10 items-center border-b border-border bg-muted/50 text-sm text-muted-foreground`}>
                    <span className="px-1">No</span><span className="px-2">Uraian &amp; spesifikasi</span>
                    <span className="px-2 text-right">Qty</span><span className="px-2">Satuan</span>
                    <span className="px-2 text-right">Harga satuan</span><span className="px-2 text-right">Jumlah</span><span />
                  </div>
                  {lines.map((l, i) => (
                    <div key={i} className={`${ITEM_GRID} border-b border-border py-2 last:border-0`}>
                      <span className="px-1 pt-1.5 text-sm">{i + 1}</span>
                      <div className="flex flex-col gap-0.5">
                        <Input className={`${cell} font-medium`} aria-label="Uraian" placeholder="Uraian barang" value={l.description} onChange={(e) => set(i, { description: e.target.value })} required />
                        <Input className={`${cell} h-7 text-xs text-muted-foreground`} aria-label="Spesifikasi" placeholder="Spesifikasi (opsional)" value={l.spec} onChange={(e) => set(i, { spec: e.target.value })} />
                        <Select aria-label="Barang katalog" className={`${cell} h-7 text-xs text-muted-foreground`} value={l.productId} onChange={(e) => pick(i, e.target.value)}>
                          <option value="">Item custom (tanpa katalog)</option>
                          {products.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                        </Select>
                        {(() => {
                          const p = products.find((x) => x.id === l.productId);
                          return p && p.price !== parseRp(l.unitPrice) ? (
                            <span className="px-2 text-xs text-muted-foreground">Harga katalog Rp {fmtNum(p.price)}, harga di penawaran ini berbeda</span>
                          ) : null;
                        })()}
                      </div>
                      <Input className={`${cell} text-right`} aria-label="Jumlah" placeholder="Qty" inputMode="numeric" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} required />
                      <Input className={cell} aria-label="Satuan" placeholder="Satuan" value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} required />
                      <Input className={`${cell} text-right`} aria-label="Harga satuan (tanpa PPN)" inputMode="decimal" placeholder="0" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} onBlur={() => parseRp(l.unitPrice) > 0 && set(i, { unitPrice: fmtNum(parseRp(l.unitPrice)) })} required />
                      <span className="px-2 pt-1.5 text-right text-sm tabular-nums">{fmtNum((Number(l.qty) || 0) * parseRp(l.unitPrice))}</span>
                      <button
                        type="button" aria-label="Hapus item" title="Hapus item" disabled={lines.length === 1}
                        onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                      ><Trash2 className="size-4" aria-hidden /></button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Termin pembayaran</CardTitle>
              <p className="text-sm text-muted-foreground">DP, termin, atau lunas. Total harus 100%</p>
            </CardHeader>
            <CardContent><TermsEditor rows={terms} onChange={setTerms} order={order} /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Catatan</CardTitle><p className="text-sm text-muted-foreground">Pilih dari daftar, lalu bisa diedit. Satu catatan per baris, tampil sebagai butir di PDF.</p></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {NOTE_PRESETS.map((p, i) => (
                  <label key={p.label} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox" checked={noteChecks[i]} className="size-4 accent-primary"
                      onChange={(e) => setNoteChecks((c) => c.map((v, j) => (j === i ? e.target.checked : v)))}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="extraNotes">Catatan tambahan</Label>
                <Textarea id="extraNotes" value={extraNotes} onChange={(e) => setExtraNotes(e.target.value)} maxLength={700} placeholder="Waktu pengerjaan 14 hari kerja setelah DP diterima." />
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="flex h-fit flex-col gap-3 lg:sticky lg:top-6">
          <Card>
            <CardHeader className="pb-4"><CardTitle>Ringkasan</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{fmtRpFull(order.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">PPN {company?.ppnRate ?? 0}%</span><span className="tabular-nums">{fmtRpFull(order.ppn)}</span></div>
              <div className="mt-1 flex items-baseline justify-between border-t border-border pt-3 text-base font-semibold"><span>Total</span><span className="text-xl tabular-nums">{fmtRpFull(order.total)}</span></div>
              <p className="text-xs text-muted-foreground">Terbilang: {terbilangRupiah(order.total)}</p>
              <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
                {terms.map((t, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t.label || `Termin ${i + 1}`} {t.percent && `${t.percent}%`}</span>
                    <span className="tabular-nums">{fmtRpFull(termSums[i]?.total ?? 0)}</span>
                  </div>
                ))}
              </div>
              {state?.error && <p role="alert" className="mt-2 font-medium">{state.error}</p>}
              <Button type="submit" name="intent" value="kirim" disabled={pending} className="mt-3 h-10">{pending ? "Menyimpan…" : "Kirim penawaran"}</Button>
              {initial ? (
                <Button asChild variant="outline" className="h-10"><a href={`/api/dokumen/penawaran/${initial.id}`} target="_blank" rel="noreferrer">Pratinjau PDF</a></Button>
              ) : (
                <Button type="button" variant="outline" className="h-10" disabled title="Simpan draf dulu untuk melihat PDF">Pratinjau PDF</Button>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </form>
  );
}
