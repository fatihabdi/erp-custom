"use client";

import { ActionForm } from "@/components/action-form";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { MAINTENANCE_LABEL, type MaintenanceTypeName } from "@/lib/asset";
import {
  addMaintenanceAction, assignAssetAction, changeStatusAction, deleteAssetAction, deleteMaintenanceAction,
  disposeAssetAction, moveAssetAction, returnAssetAction, updateAssetAction,
} from "../actions";
import { AssetFields, type AssetDefaults } from "../asset-fields";

export function AssetEditForm({ id, d }: { id: string; d: AssetDefaults }) {
  return (
    <ActionForm action={updateAssetAction} submit="Simpan" className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={id} />
      <AssetFields d={d} />
    </ActionForm>
  );
}

export function StatusForm({ id, status }: { id: string; status: string }) {
  return (
    <ActionForm action={changeStatusAction} submit="Ubah status" variant="outline" size="sm" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="status">Status</Label>
        <Select id="status" name="status" defaultValue={status} className="w-48">
          <option value="AKTIF">Aktif</option>
          <option value="PERAWATAN">Dalam perawatan</option>
          <option value="RUSAK">Rusak</option>
        </Select>
      </div>
    </ActionForm>
  );
}

export function MoveForm({ id, location }: { id: string; location: string }) {
  return (
    <ActionForm action={moveAssetAction} submit="Pindahkan" variant="outline" size="sm" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="location-move">Lokasi baru</Label>
        <Input id="location-move" name="location" defaultValue={location} maxLength={120} className="w-56" />
      </div>
    </ActionForm>
  );
}

export function MaintenanceForm({ id, today }: { id: string; today: string }) {
  return (
    <ActionForm action={addMaintenanceAction} submit="Catat perawatan" size="sm" className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="m-type">Jenis</Label>
        <Select id="m-type" name="type" defaultValue="SERVIS">
          {(Object.keys(MAINTENANCE_LABEL) as MaintenanceTypeName[]).map((t) => <option key={t} value={t}>{MAINTENANCE_LABEL[t]}</option>)}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="m-date">Tanggal</Label>
        <Input id="m-date" name="performedAt" type="date" defaultValue={today} max={today} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="m-cost">Biaya (Rp)</Label>
        <Input id="m-cost" name="cost" inputMode="decimal" defaultValue="0" />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="m-desc">Uraian pekerjaan</Label>
        <Input id="m-desc" name="description" required maxLength={500} placeholder="mis. Ganti oli dan filter" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="m-vendor">Bengkel / vendor</Label>
        <Input id="m-vendor" name="vendor" maxLength={120} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="m-next">Jadwal berikutnya</Label>
        <Input id="m-next" name="nextDueAt" type="date" />
      </div>
    </ActionForm>
  );
}

export function DeleteMaintenanceForm({ id, maintenanceId }: { id: string; maintenanceId: string }) {
  return (
    <ActionForm action={deleteMaintenanceAction} submit="Hapus" variant="ghost" size="sm" confirm="Hapus catatan perawatan ini?">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="maintenanceId" value={maintenanceId} />
    </ActionForm>
  );
}

export function AssignForm({ id, today }: { id: string; today: string }) {
  return (
    <ActionForm action={assignAssetAction} submit="Tugaskan" size="sm" className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="a-who">Penanggung jawab / bagian</Label>
        <Input id="a-who" name="assignee" required maxLength={120} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="a-date">Tanggal</Label>
        <Input id="a-date" name="assignedAt" type="date" defaultValue={today} max={today} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="a-note">Catatan</Label>
        <Input id="a-note" name="note" maxLength={300} />
      </div>
    </ActionForm>
  );
}

export function ReturnForm({ id, today }: { id: string; today: string }) {
  return (
    <ActionForm action={returnAssetAction} submit="Kembalikan" variant="outline" size="sm" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="r-date">Tanggal kembali</Label>
        <Input id="r-date" name="returnedAt" type="date" defaultValue={today} max={today} required className="w-44" />
      </div>
    </ActionForm>
  );
}

export function DisposeForm({ id, today }: { id: string; today: string }) {
  return (
    <ActionForm
      action={disposeAssetAction} submit="Lepas aset" variant="outline" size="sm" className="grid gap-3 sm:grid-cols-3"
      confirm="Aset yang dilepas tidak bisa diubah lagi. Lanjutkan?"
    >
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="d-status">Dilepas karena</Label>
        <Select id="d-status" name="status" defaultValue="DIJUAL">
          <option value="DIJUAL">Dijual</option>
          <option value="DIHAPUSKAN">Dihapuskan (afkir)</option>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="d-date">Tanggal</Label>
        <Input id="d-date" name="disposedAt" type="date" defaultValue={today} max={today} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="d-value">Hasil penjualan (Rp)</Label>
        <Input id="d-value" name="value" inputMode="decimal" placeholder="0" />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-3">
        <Label htmlFor="d-note">Catatan</Label>
        <Textarea id="d-note" name="note" maxLength={300} className="min-h-14" />
      </div>
    </ActionForm>
  );
}

export function DeleteAssetForm({ id }: { id: string }) {
  return (
    <ActionForm action={deleteAssetAction} submit="Hapus aset" variant="outline" size="sm" confirm="Hapus aset ini? Tindakan ini tidak bisa dibatalkan.">
      <input type="hidden" name="id" value={id} />
    </ActionForm>
  );
}
