"use client";

import { useActionState } from "react";
import { updateItem } from "../../actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function ItemForm({ item, linked }: { linked: boolean; item: { id: string; name: string; unit: string; minStock: number; unitCost: number; notes: string; active: boolean } }) {
  const [state, action, pending] = useActionState(updateItem, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={item.id} />
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="name">Nama barang</Label>
        <Input id="name" name="name" defaultValue={item.name} required maxLength={120} readOnly={linked} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="unit">Satuan</Label>
        <Input id="unit" name="unit" defaultValue={item.unit} required maxLength={20} readOnly={linked} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="minStock">Stok minimum</Label>
        <Input id="minStock" name="minStock" inputMode="decimal" defaultValue={String(item.minStock)} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="unitCost">Harga pokok per satuan (Rp)</Label>
        <Input id="unitCost" name="unitCost" inputMode="decimal" defaultValue={String(item.unitCost)} />
        <p className="text-xs text-muted-foreground">Dipakai menghitung biaya bahan proyek saat bahan dikeluarkan.</p>
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="notes">Catatan</Label>
        <Input id="notes" name="notes" defaultValue={item.notes} maxLength={300} />
      </div>
      {linked ? (
        <p className="text-xs text-muted-foreground sm:col-span-2">Nama, satuan, dan status aktif mengikuti produk di Master Produk.</p>
      ) : (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="active" defaultChecked={item.active} /> Aktif
        </label>
      )}
      {state?.error && <p role="alert" className="text-sm font-medium sm:col-span-2">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm sm:col-span-2">{state.ok}</p>}
      <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</Button></div>
    </form>
  );
}
