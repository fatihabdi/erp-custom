"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { removeSoImageAction, updateSoAction, updateSoStageAction, uploadSoImageAction } from "../actions";

export type SoEditLine = { id: string; title: string; spec: string };

export function SoEditForm({ id, notes, lines }: { id: string; notes: string; lines: SoEditLine[] }) {
  return (
    <ActionForm action={updateSoAction} submit="Simpan Sales Order" className="grid gap-4">
      <input type="hidden" name="id" value={id} />
      {lines.map((l, i) => (
        <div key={l.id} className="grid gap-3 rounded-lg border border-border p-3">
          <input type="hidden" name="lineId" value={l.id} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`judul-${l.id}`}>Nama barang {lines.length > 1 ? `#${i + 1}` : ""}</Label>
            <Input id={`judul-${l.id}`} name="title" defaultValue={l.title} maxLength={200} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`spek-${l.id}`}>Spesifikasi</Label>
            <Textarea id={`spek-${l.id}`} name="spec" defaultValue={l.spec} rows={5} maxLength={2000} placeholder={"P. 120 x L.60 x T.75 cm\nRangka hollow 25x25 mm, powder coating\nMultipleks, HPL, edging"} />
            <p className="text-xs text-muted-foreground">Satu butir per baris. Ukuran, bahan, dan finishing yang dipakai produksi.</p>
          </div>
        </div>
      ))}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="so-notes">Catatan untuk produksi</Label>
        <Textarea id="so-notes" name="notes" defaultValue={notes} rows={3} maxLength={2000} />
      </div>
    </ActionForm>
  );
}

export function SoImageForm({ lineId, hasImage }: { lineId: string; hasImage: boolean }) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <ActionForm action={uploadSoImageAction} submit={hasImage ? "Ganti gambar" : "Unggah gambar"} variant="outline" size="sm" className="flex flex-wrap items-start gap-2">
        <input type="hidden" name="lineId" value={lineId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`img-${lineId}`}>Gambar acuan (PNG atau JPEG, maks. 2 MB)</Label>
          <Input id={`img-${lineId}`} name="image" type="file" accept="image/png,image/jpeg" className="w-72" />
        </div>
      </ActionForm>
      {hasImage && (
        <ActionForm action={removeSoImageAction} submit="Hapus gambar" variant="ghost" size="sm" confirm="Hapus gambar ini?">
          <input type="hidden" name="lineId" value={lineId} />
        </ActionForm>
      )}
    </div>
  );
}

export type SoStageOption = { stage: string; label: string; done: number; min: number; max: number; held: boolean; note: string };

/** Progres tahap yang boleh diperbarui pengguna ini (ketua produksi hanya tahapnya sendiri). */
export function SoStageForm({ projectLineId, options }: { projectLineId: string; options: SoStageOption[] }) {
  const [stage, setStage] = useState(options[0]?.stage ?? "");
  const o = options.find((x) => x.stage === stage);
  const [held, setHeld] = useState(options[0]?.held ?? false);
  if (!o) return null;
  return (
    <ActionForm action={updateSoStageAction} submit="Simpan progres" size="sm" className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="lineId" value={projectLineId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`tahap-${projectLineId}`}>Tahap</Label>
        <Select id={`tahap-${projectLineId}`} name="stage" value={stage} onChange={(e) => { setStage(e.target.value); setHeld(options.find((x) => x.stage === e.target.value)?.held ?? false); }} className="w-40">
          {options.map((x) => <option key={x.stage} value={x.stage}>{x.label}</option>)}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`jumlah-${projectLineId}`}>Unit selesai</Label>
        <Input key={stage} id={`jumlah-${projectLineId}`} name="done" inputMode="numeric" className="w-24" defaultValue={String(o.done)} />
        <p className="text-xs text-muted-foreground">Boleh {o.min}–{o.max}</p>
      </div>
      <label className="flex h-9 items-center gap-2 self-start pt-6 text-sm">
        <input type="checkbox" name="held" checked={held} onChange={(e) => setHeld(e.target.checked)} /> Tertahan
      </label>
      {held && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`alasan-${projectLineId}`}>Alasan</Label>
          <Input id={`alasan-${projectLineId}`} name="holdNote" key={stage} defaultValue={o.note} maxLength={300} className="w-56" placeholder="mis. menunggu bahan" />
        </div>
      )}
    </ActionForm>
  );
}
