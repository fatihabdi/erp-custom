"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createMovement } from "../../actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { fmtQty } from "@/lib/format";

type Item = { id: string; code: string; name: string; unit: string; kind: "RAW" | "FINISHED"; onHand: number };

export function MovementForm({ type: initial, itemId, items }: { type: string; itemId?: string; items: Item[] }) {
  const [state, action, pending] = useActionState(createMovement, undefined);
  const [type, setType] = useState(initial);
  const [sel, setSel] = useState(itemId ?? items[0]?.id ?? "");
  const item = items.find((i) => i.id === sel);
  return (
    <form action={action} className="grid gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="type">Jenis</Label>
        <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="MASUK">Stok masuk</option>
          <option value="KELUAR">Stok keluar</option>
          <option value="PENYESUAIAN">Penyesuaian (koreksi hitung fisik)</option>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="itemId">Barang</Label>
        <Select id="itemId" name="itemId" value={sel} onChange={(e) => setSel(e.target.value)} required>
          <optgroup label="Barang jadi">
            {items.filter((i) => i.kind === "FINISHED").map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
          </optgroup>
          <optgroup label="Bahan baku">
            {items.filter((i) => i.kind === "RAW").map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
          </optgroup>
        </Select>
        {item && <p className="text-xs text-muted-foreground">Stok saat ini: {fmtQty(item.onHand)} {item.unit}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="qty">{type === "PENYESUAIAN" ? "Selisih (+ tambah, − kurang)" : "Jumlah"}{item ? ` (${item.unit})` : ""}</Label>
        <Input id="qty" name="qty" inputMode="decimal" required placeholder={type === "PENYESUAIAN" ? "-1" : "10"} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note">{type === "PENYESUAIAN" ? "Alasan (wajib)" : "Catatan"}</Label>
        <Input id="note" name="note" required={type === "PENYESUAIAN"} maxLength={300}
          placeholder={type === "PENYESUAIAN" ? "mis. rusak, hasil hitung fisik" : "mis. stok awal, pembelian"} />
      </div>
      {state?.error && <p role="alert" className="text-sm font-medium">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</Button>
        <Button asChild variant="outline"><Link href="/inventory">Batal</Link></Button>
      </div>
    </form>
  );
}
