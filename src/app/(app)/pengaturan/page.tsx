import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ActionForm } from "@/components/action-form";
import { CompanyBadge, missingCompanyFields } from "@/components/doc-bits";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { removeLogoAction, saveCompanyAction, uploadLogoAction } from "./actions";

export default async function PengaturanPage() {
  const user = await requirePermission("pengaturan");
  const canEdit = can(user.role, "pengaturan", "edit");
  const companies = await db.company.findMany({
    where: { active: true, ...(user.companies.length > 0 ? { id: { in: user.companies.map((c) => c.id) } } : {}) }, orderBy: { code: "asc" },
  });
  const logos = await db.companyLogo.findMany({ where: { companyId: { in: companies.map((c) => c.id) } }, select: { companyId: true, updatedAt: true } });
  const field = (c: (typeof companies)[number], name: keyof (typeof companies)[number] & string, label: string, ph?: string, span = false) => (
    <div className={`flex flex-col gap-1.5 ${span ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={`${name}-${c.id}`}>{label}</Label>
      <Input id={`${name}-${c.id}`} name={name} defaultValue={(c[name] as string | null) ?? ""} placeholder={ph} disabled={!canEdit} />
    </div>
  );
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Pengaturan</h1>
        <p className="text-sm text-muted-foreground">Data perusahaan yang tercetak di penawaran, konfirmasi order, invoice, dan kwitansi. Yang masih kosong tampil sebagai [tanda kurung] di PDF.</p>
      </div>
      {companies.map((c) => {
        const logo = logos.find((l) => l.companyId === c.id);
        const missing = missingCompanyFields(c, !!logo);
        return (
          <Card key={c.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2"><CardTitle>{c.name}</CardTitle><CompanyBadge code={c.code} ppnRate={Number(c.ppnRate)} />
                {missing.length > 0 ? <Badge variant="secondary">Belum lengkap: {missing.join(", ")}</Badge> : <Badge>Lengkap</Badge>}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {logo ? <img src={`/api/perusahaan/${c.id}/logo?v=${logo.updatedAt.getTime()}`} alt={`Logo ${c.code}`} className="size-full object-contain" /> : `LOGO ${c.code}`}
                </div>
                {canEdit && (
                  <div className="flex flex-wrap items-start gap-3">
                    <ActionForm action={uploadLogoAction} submit="Unggah logo" size="sm" variant="outline" className="flex items-center gap-2">
                      <input type="hidden" name="id" value={c.id} />
                      <Input name="logo" type="file" accept="image/png,image/jpeg" aria-label={`Berkas logo ${c.code}`} className="w-64 pt-1.5" required />
                    </ActionForm>
                    {logo && (
                      <ActionForm action={removeLogoAction} submit="Hapus logo" size="sm" variant="ghost" confirm="Hapus logo?">
                        <input type="hidden" name="id" value={c.id} />
                      </ActionForm>
                    )}
                  </div>
                )}
                <p className="w-full text-xs text-muted-foreground">PNG atau JPEG, maksimal 512 KB, sebaiknya persegi.</p>
              </div>
              <ActionForm action={saveCompanyAction} submit="Simpan" className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={c.id} />
                {field(c, "name", "Nama perusahaan", undefined, true)}
                {field(c, "address", "Alamat", "Jl. …", true)}
                {field(c, "city", "Kota (untuk kwitansi)", "Jakarta")}
                {field(c, "phone", "Telepon")}
                {field(c, "email", "Email")}
                {field(c, "bankName", "Bank", "BCA")}
                {field(c, "bankAccount", "Nomor rekening")}
                {field(c, "bankHolder", "Atas nama", c.name)}
                {field(c, "signatoryName", "Nama penandatangan")}
                {field(c, "signatoryTitle", "Jabatan penandatangan", "Direktur")}
              </ActionForm>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
