"use client";

import { useActionState, useState } from "react";
import { setTermsAction } from "../actions";
import { Button } from "@/components/ui/button";
import { TermsEditor } from "@/components/terms-editor";
import type { OrderAmounts, TermRow } from "@/lib/billing";

export function TermsForm({ id, initial, order }: { id: string; initial: TermRow[]; order: OrderAmounts }) {
  const [state, action, pending] = useActionState(setTermsAction, undefined);
  const [rows, setRows] = useState(initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="terms" value={JSON.stringify(rows)} />
      <TermsEditor rows={rows} onChange={setRows} order={order} />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Menyimpan…" : "Simpan termin"}</Button>
        {state?.error && <p role="alert" className="text-sm font-medium">{state.error}</p>}
        {state?.ok && <p role="status" className="text-sm text-muted-foreground">{state.ok}</p>}
      </div>
    </form>
  );
}
