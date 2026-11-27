import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Tombol pratinjau dan unduh PDF dokumen. */
export function PdfLinks({ kind, id, className }: { kind: "penawaran" | "konfirmasi-order" | "invoice" | "kwitansi"; id: string; className?: string }) {
  return (
    <div className={className ?? "flex gap-2"}>
      <Button asChild variant="outline" size="sm"><a href={`/api/dokumen/${kind}/${id}`} target="_blank" rel="noreferrer">Pratinjau PDF</a></Button>
      <Button asChild variant="ghost" size="sm"><a href={`/api/dokumen/${kind}/${id}?unduh=1`}>Unduh</a></Button>
    </div>
  );
}

export function CompanyBadge({ code, ppnRate }: { code: string; ppnRate: number }) {
  return <Badge variant={ppnRate > 0 ? "default" : "outline"}>{code} · {ppnRate > 0 ? `PPN ${ppnRate}%` : "Non-PPN"}</Badge>;
}

/** Peringatan bila data perusahaan yang dicetak di PDF masih kosong. */
export function missingCompanyFields(c: { address: string | null; phone: string | null; bankName: string | null; bankAccount: string | null; signatoryName: string | null }, hasLogo: boolean): string[] {
  const m: string[] = [];
  if (!hasLogo) m.push("logo");
  if (!c.address?.trim()) m.push("alamat");
  if (!c.phone?.trim()) m.push("telepon");
  if (!c.bankName?.trim() || !c.bankAccount?.trim()) m.push("rekening bank");
  if (!c.signatoryName?.trim()) m.push("penandatangan");
  return m;
}

export function CompanyWarning({ companyCode, missing, canEdit }: { companyCode: string; missing: string[]; canEdit: boolean }) {
  if (missing.length === 0) return null;
  return (
    <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
      Data {companyCode} belum lengkap ({missing.join(", ")}); PDF akan menampilkan tanda kurung siku sebagai pengganti.{" "}
      {canEdit && <Link href="/pengaturan" className="font-medium underline">Lengkapi di Pengaturan</Link>}
    </p>
  );
}
