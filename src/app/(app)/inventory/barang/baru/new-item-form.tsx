"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createItem } from "../../actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

export function NewItemForm({ kind }: { kind: "RAW" | "FINISHED" }) {
  const [state, action, pending] = useActionState(createItem, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="kind">Jenis</Label>
        <Select id="kind" name="kind" defaultValue={kind}>
          <option value="FINISHED">Barang jadi (kode BJ-)</option>
          <option value="RAW">Bahan baku (kode BB-)</option>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="name">Nama barang</Label>
        <Input id="name" name="name" required maxLength={120} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="unit">Satuan</Label>
        <Input id="unit" name="unit" required maxLength={20} placeholder="unit, set, lembar, kg, meter" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="minStock">Stok minimum</Label>
        <Input id="minStock" name="minStock" inputMode="decimal" defaultValue="0" />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="notes">Catatan</Label>
        <Input id="notes" name="notes" maxLength={300} />
      </div>
      {state?.error && <p role="alert" className="text-sm font-medium sm:col-span-2">{state.error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</Button>
        <Button asChild variant="outline"><Link href="/inventory">Batal</Link></Button>
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">Kode dibuat otomatis. Stok awal dicatat lewat “Stok masuk”.</p>
    </form>
  );
}
