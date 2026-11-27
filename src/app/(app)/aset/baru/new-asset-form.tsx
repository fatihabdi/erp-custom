"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createAssetAction } from "../actions";
import { AssetFields } from "../asset-fields";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { TYPE_LABEL, type AssetTypeName } from "@/lib/asset";

type Category = { id: string; name: string; type: string; usefulLifeMonths: number };

export function NewAssetForm({ companies, categories }: { companies: { id: string; code: string; name: string }[]; categories: Category[] }) {
  const [state, action, pending] = useActionState(createAssetAction, undefined);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const category = categories.find((c) => c.id === categoryId);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="companyId">Perusahaan pemilik</Label>
        <Select id="companyId" name="companyId" required defaultValue={companies.length === 1 ? companies[0].id : ""}>
          {companies.length !== 1 && <option value="">Pilih…</option>}
          {companies.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="categoryId">Kategori</Label>
        <Select id="categoryId" name="categoryId" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {categories.map((c) => <option key={c.id} value={c.id}>{TYPE_LABEL[c.type as AssetTypeName]} — {c.name}</option>)}
        </Select>
      </div>
      {/* umur manfaat bawaan mengikuti kategori; kolom lain tidak ikut tereset */}
      <AssetFields d={{ lifeMonths: String(category?.usefulLifeMonths ?? 0) }} />
      {state?.error && <p role="alert" className="text-sm font-medium sm:col-span-2">{state.error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</Button>
        <Button asChild variant="outline"><Link href="/aset">Batal</Link></Button>
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">Kode dibuat otomatis (MSN-, KDR-, PRL-).</p>
    </form>
  );
}
