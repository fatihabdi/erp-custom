"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { saveBom } from "../../actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

type Material = { id: string; code: string; name: string; unit: string };
type Line = { materialId: string; qty: string };

export function BomEditor({ productId, materials, initial }: { productId: string; materials: Material[]; initial: Line[] }) {
  const [state, action, pending] = useActionState(saveBom, undefined);
  const [lines, setLines] = useState<Line[]>(initial);
  const unit = (id: string) => materials.find((m) => m.id === id)?.unit ?? "";
  const patch = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const free = materials.filter((m) => !lines.some((l) => l.materialId === m.id));

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      {lines.length === 0 && <p className="text-sm text-muted-foreground">Belum ada bahan. Tambahkan bahan baku di bawah.</p>}
      {lines.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <Select value={l.materialId} onChange={(e) => patch(i, { materialId: e.target.value })} aria-label="Bahan" className="flex-1">
            {materials.filter((m) => m.id === l.materialId || free.includes(m)).map((m) => (
              <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
            ))}
          </Select>
          <Input value={l.qty} onChange={(e) => patch(i, { qty: e.target.value })} inputMode="decimal" aria-label="Jumlah per unit" className="w-28" placeholder="0" />
          <span className="w-14 text-sm text-muted-foreground">{unit(l.materialId)}</span>
          <Button type="button" variant="ghost" size="sm" aria-label="Hapus baris" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={free.length === 0}
          onClick={() => setLines((ls) => [...ls, { materialId: free[0].id, qty: "" }])}>
          + Tambah bahan
        </Button>
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Menyimpan…" : "Simpan BOM"}</Button>
        {materials.length === 0 && <span className="text-sm text-muted-foreground">Daftarkan bahan baku dulu.</span>}
      </div>
      {state?.error && <p role="alert" className="text-sm font-medium">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm">{state.ok}</p>}
    </form>
  );
}
