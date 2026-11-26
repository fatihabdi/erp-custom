"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createCustomer, updateCustomer } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

type C = { id?: string; name: string; contact: string; phone: string; email: string; address: string; taxId: string; notes: string; active: boolean };

export function CustomerForm({ customer, next }: { customer?: C; next?: string }) {
  const [state, action, pending] = useActionState(customer ? updateCustomer : createCustomer, undefined);
  const f = (name: keyof C, label: string, span = false, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={`flex flex-col gap-1.5 ${span ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={customer ? String(customer[name] ?? "") : ""} maxLength={200} {...props} />
    </div>
  );
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {customer?.id && <input type="hidden" name="id" value={customer.id} />}
      {next && <input type="hidden" name="next" value={next} />}
      {f("name", "Nama pelanggan", true, { required: true })}
      {f("contact", "Nama kontak (PIC)")}
      {f("phone", "Telepon", false, { inputMode: "tel" })}
      {f("email", "Email", false, { type: "email" })}
      {f("taxId", "NPWP")}
      {f("address", "Alamat", true)}
      {f("notes", "Catatan", true)}
      {customer && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="active" defaultChecked={customer.active} /> Aktif
        </label>
      )}
      {state?.error && <p role="alert" className="text-sm font-medium sm:col-span-2">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm sm:col-span-2">{state.ok}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</Button>
        <Button asChild variant="outline"><Link href="/pelanggan">Kembali</Link></Button>
      </div>
    </form>
  );
}
