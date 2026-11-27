"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createMovement } from "../../actions";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { Input, Label, Select } from "@/components/ui/input";
import { fmtQty, fmtRp, fmtSigned } from "@/lib/format";
import { parseMoneyInput } from "@/lib/stock";

type Item = { id: string; code: string; name: string; unit: string; kind: "RAW" | "FINISHED"; onHand: number; unitCost: number };
type Project = { id: string; code: string; name: string };

export function MovementForm({
  type: initial, itemId, items, projects, suppliers, today, canCreateMaterial, canCreateProduct,
}: {
  type: string; itemId?: string; items: Item[]; projects: Project[]; suppliers: string[]; today: string;
  canCreateMaterial: boolean; canCreateProduct: boolean;
}) {
  const [state, action, pending] = useActionState(createMovement, undefined);
  const [type, setType] = useState(initial);
  const [sel, setSel] = useState(items.some((i) => i.id === itemId) ? itemId! : "");
  const [project, setProject] = useState("");
  const [counted, setCounted] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");

  if (items.length === 0) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-md border border-dashed border-border p-6 text-sm">
        <p className="font-medium">Belum ada barang yang bisa dicatat mutasinya.</p>
        <p className="text-muted-foreground">
          Bahan baku dibuat di menu Stok, barang jadi dibuat di Master Produk. Setelah barangnya ada, kembali ke sini untuk mencatat stok masuk, keluar, atau penyesuaian.
        </p>
        <div className="flex flex-wrap gap-2">
          {canCreateMaterial && <Button asChild><Link href="/inventory/barang/baru">+ Bahan baku</Link></Button>}
          {canCreateProduct && <Button asChild variant="outline"><Link href="/produk/baru">+ Produk (barang jadi)</Link></Button>}
          <Button asChild variant="ghost"><Link href="/inventory">Kembali ke Stok</Link></Button>
        </div>
        {!canCreateMaterial && !canCreateProduct && (
          <p className="text-muted-foreground">Hubungi Direktur atau Admin untuk menambahkannya.</p>
        )}
      </div>
    );
  }

  const options: ComboOption[] = items.map((i) => ({
    value: i.id,
    label: `${i.code} — ${i.name}`,
    hint: `Stok ${fmtQty(i.onHand)} ${i.unit}`,
    group: i.kind === "FINISHED" ? "Barang jadi" : "Bahan baku",
    keywords: i.kind === "FINISHED" ? "barang jadi produk" : "bahan baku material",
  }));
  const item = items.find((i) => i.id === sel);
  const unit = item?.unit ?? "";
  const countedNum = counted.trim() === "" ? NaN : Number(counted.trim().replace(",", "."));
  const diff = item && Number.isFinite(countedNum) ? Math.round((countedNum - item.onHand) * 1000) / 1000 : null;
  const qtyNum = Number(qty.trim().replace(",", "."));
  const priceNum = price.trim() === "" ? NaN : parseMoneyInput(price);

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type">Jenis</Label>
          <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="MASUK">Stok masuk</option>
            <option value="KELUAR">Stok keluar</option>
            <option value="PENYESUAIAN">Penyesuaian (stok opname)</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date">Tanggal mutasi</Label>
          <Input id="date" name="date" type="date" defaultValue={today} max={today} required />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="itemId">Barang</Label>
        <Combobox
          id="itemId" name="itemId" options={options} value={sel} onChange={setSel} required
          placeholder="Pilih barang…" searchPlaceholder="Cari kode atau nama barang…" emptyText="Barang tidak ditemukan."
        />
        {item && (
          <p className="text-xs text-muted-foreground">
            Stok saat ini: <span className="font-medium text-foreground">{fmtQty(item.onHand)} {item.unit}</span>
            {item.kind === "RAW" && item.unitCost > 0 && <> · harga pokok {fmtRp(item.unitCost)}/{item.unit}</>}
          </p>
        )}
      </div>

      {type === "PENYESUAIAN" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="counted">Hasil hitung fisik{unit ? ` (${unit})` : ""}</Label>
          <Input id="counted" name="counted" inputMode="decimal" required placeholder="mis. 18"
            value={counted} onChange={(e) => setCounted(e.target.value)} />
          {item && (
            <p className="text-xs text-muted-foreground">
              Tercatat {fmtQty(item.onHand)} {unit}.{" "}
              {diff === null ? "Isi hasil hitung, selisihnya dihitung otomatis." : diff === 0
                ? "Sama dengan stok tercatat, tidak ada yang disesuaikan."
                : <>Selisih <span className="font-medium text-foreground">{fmtSigned(diff)} {unit}</span> akan dicatat.</>}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qty">Jumlah{unit ? ` (${unit})` : ""}</Label>
          <Input id="qty" name="qty" inputMode="decimal" required placeholder="10" value={qty} onChange={(e) => setQty(e.target.value)} />
          {type === "KELUAR" && item && Number.isFinite(qtyNum) && qtyNum > item.onHand && (
            <p role="alert" className="text-xs font-medium text-destructive">Melebihi stok saat ini ({fmtQty(item.onHand)} {unit}).</p>
          )}
        </div>
      )}

      {type === "MASUK" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unitCost">Harga beli per satuan (Rp)</Label>
            <Input id="unitCost" name="unitCost" inputMode="decimal" placeholder="mis. 15.000" value={price} onChange={(e) => setPrice(e.target.value)} />
            {Number.isFinite(priceNum) && Number.isFinite(qtyNum) && qtyNum > 0 && (
              <p className="text-xs text-muted-foreground">Total {fmtRp(priceNum * qtyNum)}</p>
            )}
            {item?.kind === "RAW" && <p className="text-xs text-muted-foreground">Harga pokok bahan dihitung rata-rata dari pembelian.</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier">Pemasok</Label>
            <Input id="supplier" name="supplier" list="supplier-list" maxLength={120} placeholder="mis. Toko Besi Jaya" autoComplete="off" />
            <datalist id="supplier-list">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
        </div>
      )}

      {type === "KELUAR" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="projectId">Proyek tujuan (opsional)</Label>
          <Combobox
            id="projectId" name="projectId" clearable options={projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
            value={project} onChange={setProject} placeholder="Tidak untuk proyek tertentu"
            searchPlaceholder="Cari kode atau nama proyek…" emptyText="Tidak ada proyek berjalan."
          />
          <p className="text-xs text-muted-foreground">Isi bila bahan dipakai atau barang dikirim untuk proyek tertentu.</p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reference">Nomor referensi (opsional)</Label>
        <Input id="reference" name="reference" maxLength={80} placeholder="mis. nomor SO, nota pembelian, surat jalan" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note">{type === "PENYESUAIAN" ? "Alasan (wajib)" : "Catatan"}</Label>
        <Input id="note" name="note" required={type === "PENYESUAIAN"} maxLength={300}
          placeholder={type === "PENYESUAIAN" ? "mis. rusak, hasil hitung fisik" : "mis. stok awal, pembelian"} />
      </div>
      {state?.error && <p role="alert" className="text-sm font-medium text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !sel}>{pending ? "Menyimpan…" : "Simpan"}</Button>
        <Button asChild variant="outline"><Link href="/inventory">Batal</Link></Button>
      </div>
    </form>
  );
}
