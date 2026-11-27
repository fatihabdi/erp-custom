"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { TERM_PRESETS, termAmounts, toRows, type OrderAmounts, type TermRow } from "@/lib/billing";
import { fmtNum } from "@/lib/format";

const pct = (s: string) => Number(s.replace(",", ".")) || 0;

// Kolom tabel termin: nama, pemicu, persen, jatuh tempo (hari), nominal, hapus.
const GRID = "grid grid-cols-[6rem_minmax(8rem,1fr)_4.5rem_4.5rem_7.5rem_2rem] items-center gap-2 px-3";
const cell = "h-8 border-transparent bg-transparent px-2 shadow-none hover:border-input";

/**
 * Editor termin pembayaran (DP, termin, lunas). Persen harus berjumlah 100; nominal dihitung dari `order`
 * dengan aturan yang sama seperti invoice (lib/billing.ts).
 */
export function TermsEditor({
  rows, onChange, order, disabled,
}: { rows: TermRow[]; onChange: (r: TermRow[]) => void; order: OrderAmounts; disabled?: boolean }) {
  const sum = Math.round(rows.reduce((n, r) => n + pct(r.percent) * 100, 0)) / 100;
  const amounts = termAmounts(order, rows.map((r) => pct(r.percent)));
  const set = (i: number, patch: Partial<TermRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            aria-label="Skema bawaan" className="h-8 w-60" disabled={disabled} value=""
            onChange={(e) => { const p = TERM_PRESETS[Number(e.target.value)]; if (p) onChange(toRows(p.terms)); }}
          >
            <option value="" disabled>Pakai skema bawaan…</option>
            {TERM_PRESETS.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
          </Select>
          <span className={`text-sm ${sum === 100 ? "text-muted-foreground" : "font-medium"}`}>Total {sum}% {sum === 100 ? "✓" : "— harus 100%"}</span>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={disabled || rows.length >= 12} onClick={() => onChange([...rows, { label: `Termin ${rows.length + 1}`, trigger: "", percent: "", dueDays: "14" }])}>+ Tambah termin</Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <div className="min-w-[36rem]">
          <div className={`${GRID} h-10 border-b border-border bg-muted/50 text-sm text-muted-foreground`}>
            <span className="px-2">Termin</span><span className="px-2">Pemicu</span>
            <span className="px-2 text-right">Persen</span>
            <span className="px-2 text-right" title="Jatuh tempo (hari setelah invoice)">Hari</span>
            <span className="text-right" title="Nominal termasuk PPN">Nominal</span><span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className={`${GRID} border-b border-border py-1 last:border-0`}>
              <Input className={cell} aria-label="Nama termin" placeholder="DP" value={r.label} disabled={disabled} onChange={(e) => set(i, { label: e.target.value })} />
              <Input className={cell} aria-label="Pemicu" placeholder="Saat barang dikirim" value={r.trigger} disabled={disabled} onChange={(e) => set(i, { trigger: e.target.value })} />
              <Input className={`${cell} text-right`} aria-label="Persen" placeholder="%" inputMode="decimal" value={r.percent} disabled={disabled} onChange={(e) => set(i, { percent: e.target.value })} />
              <Input className={`${cell} text-right`} aria-label="Jatuh tempo (hari setelah invoice)" title="Jatuh tempo (hari setelah invoice)" placeholder="Hari" inputMode="numeric" value={r.dueDays} disabled={disabled} onChange={(e) => set(i, { dueDays: e.target.value })} />
              <span className="text-right text-sm tabular-nums" title="Nominal termasuk PPN">{fmtNum(amounts[i]?.total ?? 0)}</span>
              <button
                type="button" aria-label="Hapus termin" title="Hapus termin"
                disabled={disabled || rows.length === 1} onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              ><Trash2 className="size-4" aria-hidden /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
