"use client";

import { useActionState } from "react";
import { createCategoryAction, updateCategoryAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { TD } from "@/components/ui/table";

/** Satu baris tabel kategori yang bisa diubah langsung. */
export function CategoryForm({ c, typeLabel, count }: { c: { id: string; name: string; usefulLifeMonths: number; active: boolean }; typeLabel: string; count: number }) {
  const [state, action, pending] = useActionState(updateCategoryAction, undefined);
  const formId = `kat-${c.id}`;
  return (
    <>
      <TD>
        <form id={formId} action={action} />
        <input type="hidden" name="id" value={c.id} form={formId} />
        <Input name="name" form={formId} defaultValue={c.name} required maxLength={80} aria-label="Nama kategori" />
      </TD>
      <TD>{typeLabel}</TD>
      <TD><Input name="usefulLifeMonths" form={formId} inputMode="numeric" defaultValue={String(c.usefulLifeMonths)} className="w-24" aria-label="Umur manfaat (bulan)" /></TD>
      <TD>{count}</TD>
      <TD><input type="checkbox" name="active" form={formId} defaultChecked={c.active} aria-label="Aktif" /></TD>
      <TD>
        <Button type="submit" form={formId} size="sm" variant="outline" disabled={pending}>{pending ? "…" : "Simpan"}</Button>
        {state?.error && <p role="alert" className="mt-1 text-xs font-medium">{state.error}</p>}
        {state?.ok && <p role="status" className="mt-1 text-xs text-muted-foreground">{state.ok}</p>}
      </TD>
    </>
  );
}

export function NewCategoryForm({ types }: { types: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState(createCategoryAction, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="c-name">Nama kategori</Label>
        <Input id="c-name" name="name" required maxLength={80} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="c-type">Jenis</Label>
        <Select id="c-type" name="type" defaultValue="MESIN">
          {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="c-life">Umur manfaat (bulan)</Label>
        <Input id="c-life" name="usefulLifeMonths" inputMode="numeric" defaultValue="48" />
      </div>
      {state?.error && <p role="alert" className="text-sm font-medium sm:col-span-3">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm sm:col-span-3">{state.ok}</p>}
      <div className="sm:col-span-3"><Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Tambah kategori"}</Button></div>
    </form>
  );
}
