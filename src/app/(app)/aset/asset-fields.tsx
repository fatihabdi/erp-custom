import { Input, Label, Textarea } from "@/components/ui/input";

export type AssetDefaults = {
  name?: string; brand?: string; serialNumber?: string; location?: string; acquiredAt?: string;
  cost?: string; salvage?: string; lifeMonths?: string; notes?: string;
};

/** Kolom data aset yang dipakai bersama formulir baru dan formulir ubah. */
export function AssetFields({ d = {} }: { d?: AssetDefaults }) {
  return (
    <>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="name">Nama aset</Label>
        <Input id="name" name="name" defaultValue={d.name} required maxLength={120} placeholder="mis. Mesin potong kayu panel saw" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brand">Merek / tipe</Label>
        <Input id="brand" name="brand" defaultValue={d.brand} maxLength={120} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="serialNumber">No. seri / no. polisi</Label>
        <Input id="serialNumber" name="serialNumber" defaultValue={d.serialNumber} maxLength={80} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="acquiredAt">Tanggal perolehan</Label>
        <Input id="acquiredAt" name="acquiredAt" type="date" defaultValue={d.acquiredAt} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="location">Lokasi</Label>
        <Input id="location" name="location" defaultValue={d.location} maxLength={120} placeholder="mis. Bengkel rangka besi" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cost">Nilai perolehan (Rp)</Label>
        <Input id="cost" name="cost" inputMode="decimal" defaultValue={d.cost ?? "0"} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="salvage">Nilai sisa (Rp)</Label>
        <Input id="salvage" name="salvage" inputMode="decimal" defaultValue={d.salvage ?? "0"} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="lifeMonths">Umur manfaat (bulan)</Label>
        <Input key={d.lifeMonths} id="lifeMonths" name="lifeMonths" inputMode="numeric" defaultValue={d.lifeMonths ?? "0"} />
        <p className="text-xs text-muted-foreground">Penyusutan garis lurus per bulan penuh. Isi 0 bila aset tidak disusutkan.</p>
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="notes">Catatan</Label>
        <Textarea id="notes" name="notes" defaultValue={d.notes} maxLength={500} />
      </div>
    </>
  );
}
