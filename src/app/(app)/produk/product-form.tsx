"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { CATEGORY_LABEL, PRODUCT_CATEGORIES, PRODUCT_TYPES, TYPE_LABEL } from "@/lib/product";
import type { FormState } from "@/components/action-form";

export type ProductFormValues = {
  id?: string; name: string; category: string; type: string; unit: string; size: string; material: string; spec: string;
  price: string; cost: string; active: boolean;
};

export const EMPTY_PRODUCT: ProductFormValues = {
  name: "", category: "SEKOLAH", type: "PRODUKSI", unit: "unit", size: "", material: "", spec: "", price: "", cost: "", active: true,
};

export function ProductForm({
  action, initial, showCost, cancelHref,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  initial: ProductFormValues;
  /** Harga pokok hanya tampil untuk peran yang berhak. */
  showCost: boolean;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="name">Nama produk</Label>
        <Input id="name" name="name" defaultValue={initial.name} required maxLength={160} placeholder="Meja siswa SD, 60 x 40 cm, kayu karet" />
        <p className="text-xs text-muted-foreground">Setiap varian (ukuran, warna, bahan) dibuat sebagai produk tersendiri.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category">Kategori</Label>
        <Select id="category" name="category" defaultValue={initial.category}>
          {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="type">Tipe</Label>
        <Select id="type" name="type" defaultValue={initial.type}>
          {PRODUCT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}{t === "PRODUKSI" ? " (dibuat sendiri)" : " (dibeli jadi)"}</option>)}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="unit">Satuan</Label>
        <Input id="unit" name="unit" defaultValue={initial.unit} required maxLength={20} placeholder="unit, set, pcs" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="size">Ukuran</Label>
        <Input id="size" name="size" defaultValue={initial.size} maxLength={120} placeholder="120 x 60 x 75 cm" />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="material">Bahan</Label>
        <Input id="material" name="material" defaultValue={initial.material} maxLength={120} placeholder="Kayu mahoni, rangka besi hollow" />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="spec">Spesifikasi lain</Label>
        <Textarea id="spec" name="spec" defaultValue={initial.spec} maxLength={2000} placeholder={"Finishing duco putih\nLaci 2 buah"} />
        <p className="text-xs text-muted-foreground">Satu butir per baris. Ikut terisi otomatis di penawaran dan Sales Order.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="price">Harga jual (Rp, belum PPN)</Label>
        <Input id="price" name="price" inputMode="decimal" defaultValue={initial.price} placeholder="0" />
        <p className="text-xs text-muted-foreground">Acuan saja: harga di penawaran boleh diubah per transaksi. PPN dihitung di dokumen.</p>
      </div>
      {showCost && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cost">Harga pokok (Rp)</Label>
          <Input id="cost" name="cost" inputMode="decimal" defaultValue={initial.cost} placeholder="0" />
          <p className="text-xs text-muted-foreground">Diisi manual. Tidak dihitung dari BOM.</p>
        </div>
      )}
      {initial.id && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="active" defaultChecked={initial.active} /> Aktif (muncul di pilihan penawaran dan proyek)
        </label>
      )}
      {state?.error && <p role="alert" className="text-sm font-medium sm:col-span-2">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm sm:col-span-2">{state.ok}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : initial.id ? "Simpan" : "Simpan produk"}</Button>
        <Button asChild variant="outline"><Link href={cancelHref}>{initial.id ? "Kembali" : "Batal"}</Link></Button>
      </div>
    </form>
  );
}
