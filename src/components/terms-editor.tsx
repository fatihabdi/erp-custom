"use client";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { TERM_PRESETS, termAmounts, toRows, type OrderAmounts, type TermRow } from "@/lib/billing";
import { fmtNum } from "@/lib/format";

const pct = (s: string) => Number(s.replace(",", ".")) || 0;

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
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Skema bawaan" className="w-64" disabled={disabled} value=""
          onChange={(e) => { const p = TERM_PRESETS[Number(e.target.value)]; if (p) onChange(toRows(p.terms)); }}
        >
          <option value="" disabled>Pakai skema bawaan…</option>
          {TERM_PRESETS.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
        </Select>
        <span className={`text-sm ${sum === 100 ? "text-muted-foreground" : "font-medium"}`}>Total {sum}% {sum === 100 ? "✓" : "— harus 100%"}</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(7rem,1fr)_5rem_5rem_7rem_auto]">
          <Input aria-label="Nama termin" placeholder="Nama termin, mis. DP" value={r.label} disabled={disabled} onChange={(e) => set(i, { label: e.target.value })} />
          <Input aria-label="Persen" placeholder="%" inputMode="decimal" value={r.percent} disabled={disabled} onChange={(e) => set(i, { percent: e.target.value })} />
          <Input aria-label="Jatuh tempo (hari setelah invoice)" title="Jatuh tempo (hari setelah invoice)" placeholder="Hari" inputMode="numeric" value={r.dueDays} disabled={disabled} onChange={(e) => set(i, { dueDays: e.target.value })} />
          <span className="col-span-2 text-right text-sm tabular-nums sm:col-span-1" title="Nominal termasuk PPN">Rp {fmtNum(amounts[i]?.total ?? 0)}</span>
          <Button type="button" variant="ghost" size="sm" disabled={disabled || rows.length === 1} onClick={() => onChange(rows.filter((_, j) => j !== i))}>Hapus</Button>
          <Input className="col-span-full" aria-label="Pemicu" placeholder="Pemicu, mis. Saat barang dikirim" value={r.trigger} disabled={disabled} onChange={(e) => set(i, { trigger: e.target.value })} />
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" disabled={disabled || rows.length >= 12} onClick={() => onChange([...rows, { label: `Termin ${rows.length + 1}`, trigger: "", percent: "", dueDays: "14" }])}>+ Tambah termin</Button>
      </div>
    </div>
  );
}

