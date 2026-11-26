"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";

export type FormState = { error?: string; ok?: string } | undefined;

/** Formulir kecil untuk server action: menampilkan galat atau keberhasilan di tempat. */
export function ActionForm({
  action, children, submit, variant = "default", size = "default", className, confirm,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  children?: React.ReactNode;
  submit: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
    >
      {children}
      <Button type="submit" variant={variant} size={size} disabled={pending}>{pending ? "Memproses…" : submit}</Button>
      {state?.error && <p role="alert" className="mt-2 w-full text-sm font-medium">{state.error}</p>}
      {state?.ok && <p role="status" className="mt-2 w-full text-sm text-muted-foreground">{state.ok}</p>}
    </form>
  );
}
