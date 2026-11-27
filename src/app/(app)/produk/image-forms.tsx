"use client";

import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { removeProductImageAction, uploadProductImageAction } from "./actions";

export function ProductImageForms({ id, hasImage }: { id: string; hasImage: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <ActionForm action={uploadProductImageAction} submit={hasImage ? "Ganti gambar" : "Unggah gambar"} variant="outline" size="sm" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <Input type="file" name="image" accept="image/png,image/jpeg" aria-label="Berkas gambar" className="w-64" required />
      </ActionForm>
      {hasImage && (
        <ActionForm action={removeProductImageAction} submit="Hapus gambar" variant="ghost" size="sm" confirm="Hapus gambar produk ini?" className="flex">
          <input type="hidden" name="id" value={id} />
        </ActionForm>
      )}
      <p className="text-xs text-muted-foreground">PNG atau JPEG, maksimal 2 MB. Gambar ikut menjadi acuan awal di Sales Order.</p>
    </div>
  );
}
