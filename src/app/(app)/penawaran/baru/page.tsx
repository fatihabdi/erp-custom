import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { toDateInput } from "@/lib/format";
import { QuotationForm } from "./quotation-form";

export default async function PenawaranBaruPage({ searchParams }: { searchParams: Promise<{ pelanggan?: string }> }) {
  const user = await requirePermission("penawaran", "create");
  const sp = await searchParams;
  const [companies, customers, products] = await Promise.all([
    db.company.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    db.customer.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.item.findMany({ where: { kind: "FINISHED", active: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, unit: true } }),
  ]);
  const allowed = (user.companies.length > 0 ? companies.filter((c) => user.companies.some((u) => u.id === c.id)) : companies)
    .map((c) => ({ id: c.id, code: c.code, name: c.name, ppnRate: Number(c.ppnRate) }));
  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <QuotationForm companies={allowed} customers={customers} products={products} defaultDate={toDateInput(new Date())} defaultCustomerId={sp.pelanggan} />
    </div>
  );
}
