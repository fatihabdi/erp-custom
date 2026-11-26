import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can, ROLES, ROLE_LABEL } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { setUserActive } from "./actions";
import { UserForm } from "./user-form";

export default async function PenggunaPage() {
  const me = await requirePermission("pengguna");
  const [users, companies] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { companies: { include: { company: { select: { code: true } } } } },
    }),
    db.company.findMany({ where: { active: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  const canCreate = can(me.role, "pengguna", "create");
  const canEdit = can(me.role, "pengguna", "edit");
  const roles = ROLES.filter((r) => r !== "DIREKTUR" || me.role === "DIREKTUR").map((r) => ({
    value: r, label: ROLE_LABEL[r],
  }));

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Pengguna</h1>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="p-3 font-medium">Nama</th>
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Peran</th>
                <th className="p-3 font-medium">Perusahaan</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="p-3">{u.name}</td>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">{ROLE_LABEL[u.role]}</td>
                  <td className="p-3">{u.companies.map((c) => c.company.code).join(", ")}</td>
                  <td className="p-3">{u.active ? "Aktif" : "Nonaktif"}</td>
                  <td className="p-3 text-right">
                    {canEdit && u.id !== me.id && (
                      <form action={setUserActive}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="active" value={String(!u.active)} />
                        <Button variant="outline" size="sm" type="submit">{u.active ? "Nonaktifkan" : "Aktifkan"}</Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {canCreate && (
        <Card>
          <CardHeader><CardTitle>Tambah pengguna</CardTitle></CardHeader>
          <CardContent><UserForm roles={roles} companies={companies} /></CardContent>
        </Card>
      )}
    </div>
  );
}
