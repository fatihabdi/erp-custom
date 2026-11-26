import { requirePermission } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ akses?: string }>;
}) {
  const user = await requirePermission("dashboard");
  const { akses } = await searchParams;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Halo, {user.name}</h1>
      {akses === "ditolak" && (
        <p role="alert" className="rounded-lg border border-border bg-muted p-3 text-sm">
          Anda tidak punya akses ke halaman tersebut.
        </p>
      )}
      <Card>
        <CardHeader><CardTitle>Perusahaan Anda</CardTitle></CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1 text-sm">
            {user.companies.map((c) => (
              <li key={c.id}>
                <span className="font-medium">{c.code}</span> — {c.name}{" "}
                <span className="text-muted-foreground">
                  ({c.ppnRate > 0 ? `PPN ${c.ppnRate}%` : "tanpa PPN"})
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
