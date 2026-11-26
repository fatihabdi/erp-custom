import { z } from "zod";
import { db } from "@/lib/db";
import { DocumentRuleError } from "@/lib/billing";
import { NotFoundError } from "@/lib/inventory";
import { ProjectRuleError } from "@/lib/production";

/** Ubah galat aturan menjadi pesan untuk pengguna; galat lain dilempar ulang. */
export function docError(e: unknown): string {
  if (e instanceof DocumentRuleError || e instanceof ProjectRuleError || e instanceof NotFoundError) return e.message;
  // Pelanggaran unique (nomor ganda akibat permintaan bersamaan): minta coba lagi.
  if (typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "P2002") return "Nomor dokumen bentrok, silakan coba lagi.";
  throw e;
}

export async function audit(userId: string, action: string, entity: string, entityId: string, detail?: object) {
  await db.auditLog.create({ data: { userId, action, entity, entityId, detail } });
}

/** Pengguna yang dibatasi perusahaan hanya boleh memakai perusahaannya. */
export function companyAllowed(user: { companies: { id: string }[] }, companyId: string) {
  return user.companies.length === 0 || user.companies.some((c) => c.id === companyId);
}

export const int = z.preprocess(
  (v) => (typeof v === "string" ? Number(v.trim()) : v),
  z.number({ error: "Angka tidak valid" }).int("Harus bilangan bulat"),
);
/** Rupiah: terima "1.500.000" maupun "1500000". */
export const rupiah = z.preprocess(
  (v) => (typeof v === "string" ? Number(v.trim().replace(/\./g, "").replace(",", ".")) : v),
  z.number({ error: "Jumlah uang tidak valid" }),
);
export const dateField = z.preprocess((v) => (v ? new Date(`${v}T00:00:00+07:00`) : null), z.date().nullable());

export const termsSchema = z.array(z.object({
  label: z.string(), trigger: z.string(), percent: z.preprocess((v) => Number(String(v).replace(",", ".")), z.number()), dueDays: int,
}));

export function parseJson(raw: FormDataEntryValue | null, fallback: unknown = []): unknown {
  try { return JSON.parse(String(raw ?? "")); } catch { return fallback; }
}
