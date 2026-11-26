"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Input, Label, Select } from "@/components/ui/input";
import { issueMaterialsAction, passQcAction, updateStageAction } from "../actions";

export type StageOption = { stage: string; label: string; done: number; min: number; max: number; held: boolean; note: string };

/** Bahan: keluarkan bahan baku (sesuai BOM) dari stok untuk sejumlah unit. */
export function MaterialForm({ lineId, left, issued, qty }: { lineId: string; left: number; issued: number; qty: number }) {
  return (
    <ActionForm action={issueMaterialsAction} submit="Keluarkan bahan" variant="outline" size="sm" className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="lineId" value={lineId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`bahan-${lineId}`}>Bahan keluar untuk (unit)</Label>
        <Input id={`bahan-${lineId}`} name="units" inputMode="numeric" className="w-28" defaultValue={left > 0 ? String(left) : ""} disabled={left === 0} />
        <p className="text-xs text-muted-foreground">Sudah {issued} dari {qty} unit. Stok bahan dipotong sesuai BOM.</p>
      </div>
    </ActionForm>
  );
}

export function StageForm({ lineId, options }: { lineId: string; options: StageOption[] }) {
  const [stage, setStage] = useState(options[0]?.stage ?? "");
  const o = options.find((x) => x.stage === stage);
  const [held, setHeld] = useState(false);
  if (!o) return null;
  return (
    <ActionForm action={updateStageAction} submit="Simpan progres" size="sm" className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="lineId" value={lineId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`tahap-${lineId}`}>Tahap</Label>
        <Select id={`tahap-${lineId}`} name="stage" value={stage} onChange={(e) => { setStage(e.target.value); setHeld(options.find((x) => x.stage === e.target.value)?.held ?? false); }} className="w-40">
          {options.map((x) => <option key={x.stage} value={x.stage}>{x.label}</option>)}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`jumlah-${lineId}`}>Unit selesai</Label>
        <Input key={stage} id={`jumlah-${lineId}`} name="done" inputMode="numeric" className="w-24" defaultValue={String(o.done)} />
        <p className="text-xs text-muted-foreground">Boleh {o.min}–{o.max}</p>
      </div>
      <label className="flex h-9 items-center gap-2 self-start pt-6 text-sm">
        <input type="checkbox" name="held" checked={held} onChange={(e) => setHeld(e.target.checked)} /> Tertahan
      </label>
      {held && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`alasan-${lineId}`}>Alasan</Label>
          <Input id={`alasan-${lineId}`} name="holdNote" key={stage} defaultValue={o.note} maxLength={300} className="w-56" placeholder="mis. menunggu bahan" />
        </div>
      )}
    </ActionForm>
  );
}

export function QcForm({ lineId, ready }: { lineId: string; ready: number }) {
  return (
    <ActionForm action={passQcAction} submit="QC lulus, masuk stok" size="sm" className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="lineId" value={lineId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`qc-${lineId}`}>Unit lulus QC</Label>
        <Input id={`qc-${lineId}`} name="qty" inputMode="numeric" className="w-24" defaultValue={ready > 0 ? String(ready) : ""} disabled={ready === 0} />
        <p className="text-xs text-muted-foreground">{ready} unit menunggu QC</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`qcn-${lineId}`}>Catatan</Label>
        <Input id={`qcn-${lineId}`} name="note" maxLength={200} className="w-48" />
      </div>
    </ActionForm>
  );
}
