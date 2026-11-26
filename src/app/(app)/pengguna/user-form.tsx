"use client";

import { useActionState } from "react";
import { createUser } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

export function UserForm({
  roles,
  companies,
}: {
  roles: { value: string; label: string }[];
  companies: { id: string; code: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(createUser, undefined);
  return (
    <form action={action} className="grid max-w-xl gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nama</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Kata sandi awal</Label>
        <Input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="role">Peran</Label>
        <Select id="role" name="role" required>
          {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </Select>
      </div>
      <fieldset className="flex flex-col gap-1.5 sm:col-span-2">
        <legend className="text-sm font-medium">Akses perusahaan</legend>
        {companies.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="companyIds" value={c.id} defaultChecked /> {c.code} — {c.name}
          </label>
        ))}
      </fieldset>
      {state?.error && <p role="alert" className="text-sm font-medium sm:col-span-2">{state.error}</p>}
      {state?.ok && <p className="text-sm sm:col-span-2">Pengguna dibuat.</p>}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Tambah pengguna"}</Button>
      </div>
    </form>
  );
}
