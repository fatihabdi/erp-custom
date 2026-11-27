// Pencarian global di topbar. Hasil dibatasi menurut hak akses modul dan perusahaan pengguna.
import { db } from "@/lib/db";
import { can, type ModuleName, type RoleName } from "@/lib/permissions";
import { projectScope } from "@/lib/project-scope";
import { CATEGORY_LABEL, type ProductCategoryName } from "@/lib/product";
import { fmtDateLong } from "@/lib/format";

export const SEARCH_KINDS = ["pelanggan", "proyek", "penawaran", "order", "invoice", "sales-order", "produk"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export const KIND_LABEL: Record<SearchKind, string> = {
  pelanggan: "Pelanggan", proyek: "Proyek", penawaran: "Penawaran", order: "Konfirmasi Order", invoice: "Invoice", "sales-order": "Sales Order", produk: "Produk",
};
// Pelanggan mengikuti hak modul Konfirmasi Order, sama seperti menu Pelanggan di sidebar.
const KIND_MODULE: Record<SearchKind, ModuleName> = {
  pelanggan: "order", proyek: "proyek", penawaran: "penawaran", order: "order", invoice: "invoice", "sales-order": "sales-order", produk: "produk",
};

export const MIN_QUERY = 2;
export const PER_KIND = 5;

/** Jenis data yang boleh dicari peran ini. */
export const searchableKinds = (role: RoleName): SearchKind[] => SEARCH_KINDS.filter((k) => can(role, KIND_MODULE[k], "view"));

/** Rapikan kata kunci: spasi ganda dibuang, dipotong 60 karakter. */
export const normalizeQuery = (q: string | null | undefined) => (q ?? "").replace(/\s+/g, " ").trim().slice(0, 60);

export type SearchHit = { id: string; title: string; subtitle: string; href: string };
export type SearchGroup = { kind: SearchKind; label: string; hits: SearchHit[] };

type User = { role: RoleName; companies: { id: string }[] };

const has = (q: string) => ({ contains: q, mode: "insensitive" as const });

export async function searchAll(user: User, raw: string): Promise<SearchGroup[]> {
  const q = normalizeQuery(raw);
  if (q.length < MIN_QUERY) return [];
  const kinds = new Set(searchableKinds(user.role));
  const companyScope = user.companies.length > 0 ? { companyId: { in: user.companies.map((c) => c.id) } } : {};
  const take = PER_KIND;
  const customerHas = { customer: { name: has(q) } };

  const jobs: Record<SearchKind, () => Promise<SearchHit[]>> = {
    pelanggan: async () => (await db.customer.findMany({
      where: { OR: [{ name: has(q) }, { contact: has(q) }, { phone: has(q) }, { email: has(q) }], active: true }, orderBy: { name: "asc" }, take,
    })).map((c) => ({ id: c.id, title: c.name, subtitle: [c.contact, c.phone].filter(Boolean).join(" · ") || "Pelanggan", href: `/pelanggan/${c.id}` })),

    proyek: async () => (await db.project.findMany({
      where: { AND: [projectScope(user), { OR: [{ code: has(q) }, { name: has(q) }, { orderRef: has(q) }, customerHas] }] },
      orderBy: { createdAt: "desc" }, take, include: { customer: { select: { name: true } } },
    })).map((p) => ({ id: p.id, title: `${p.code} · ${p.name}`, subtitle: p.customer?.name ?? "Produksi stok", href: `/proyek/${p.id}` })),

    penawaran: async () => (await db.quotation.findMany({
      where: { ...companyScope, OR: [{ number: has(q) }, { subject: has(q) }, customerHas] },
      orderBy: { date: "desc" }, take, include: { customer: { select: { name: true } } },
    })).map((x) => ({ id: x.id, title: x.number, subtitle: `${x.customer.name} · ${x.subject}`, href: `/penawaran/${x.id}` })),

    order: async () => (await db.salesOrder.findMany({
      where: { ...companyScope, OR: [{ number: has(q) }, { project: { OR: [{ name: has(q) }, customerHas] } }] },
      orderBy: { date: "desc" }, take, include: { project: { select: { name: true, customer: { select: { name: true } } } } },
    })).map((x) => ({ id: x.id, title: x.number, subtitle: `${x.project.customer?.name ?? "-"} · ${x.project.name}`, href: `/order/${x.id}` })),

    invoice: async () => (await db.invoice.findMany({
      where: { ...companyScope, OR: [{ number: has(q) }, { description: has(q) }, { project: customerHas }] },
      orderBy: { date: "desc" }, take, include: { project: { select: { customer: { select: { name: true } } } } },
    })).map((x) => ({ id: x.id, title: x.number, subtitle: `${x.project.customer?.name ?? "-"} · ${fmtDateLong(x.date)}${x.status === "BATAL" ? " · Batal" : ""}`, href: `/invoice/${x.id}` })),

    "sales-order": async () => (await db.productionOrder.findMany({
      where: { ...companyScope, OR: [{ number: has(q) }, { project: { OR: [{ name: has(q) }, customerHas] } }, { lines: { some: { title: has(q) } } }] },
      orderBy: { createdAt: "desc" }, take, include: { project: { select: { name: true, customer: { select: { name: true } } } } },
    })).map((x) => ({ id: x.id, title: x.number, subtitle: `${x.project.customer?.name ?? "-"} · ${x.project.name}`, href: `/sales-order/${x.id}` })),

    produk: async () => (await db.product.findMany({
      where: { OR: [{ code: has(q) }, { name: has(q) }] }, orderBy: { code: "asc" }, take,
    })).map((x) => ({ id: x.id, title: `${x.code} · ${x.name}`, subtitle: CATEGORY_LABEL[x.category as ProductCategoryName], href: `/produk/${x.id}` })),
  };

  const active = SEARCH_KINDS.filter((k) => kinds.has(k));
  const results = await Promise.all(active.map((k) => jobs[k]()));
  return active.map((kind, i) => ({ kind, label: KIND_LABEL[kind], hits: results[i] })).filter((g) => g.hits.length > 0);
}
