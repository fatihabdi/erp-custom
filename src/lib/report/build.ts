// Penyusun data laporan dari database. Semua nilai uang tanpa PPN kecuali disebut lain.
import { db } from "@/lib/db";
import { daysLate, isOverdue, METHOD_LABEL, orderAmounts, paymentState, sisaTagihan, termAmounts } from "@/lib/billing";
import { paidOf } from "@/lib/documents";
import { daysUntil, fmtDateLong } from "@/lib/format";
import { CATEGORY_LABEL, type ProductCategoryName } from "@/lib/product";
import {
  agingBucket, AGING_LABELS, allocateToCategories, monthKey, monthLabel, sumMoney, termKind, TERM_KIND_LABEL,
  type Period, type ScopeResult,
} from "./filters";
import type { ReportCol, ReportData, ReportSection, ReportSlug, Row } from "./types";
import { REPORTS } from "./types";

export type Company = { id: string; code: string };
export type BuildCtx = { scope: ScopeResult<Company>; period: Period; now: Date };

const num = (d: { toString(): string } | number) => Number(d);
const text = (key: string, label: string): ReportCol => ({ key, label, type: "text" });
const rp = (key: string, label: string): ReportCol => ({ key, label, type: "rp" });
const int = (key: string, label: string): ReportCol => ({ key, label, type: "int" });
const date = (key: string, label: string): ReportCol => ({ key, label, type: "date" });
const pct = (key: string, label: string): ReportCol => ({ key, label, type: "pct" });

const periodLabel = (p: Period) => `${fmtDateLong(p.from)} - ${fmtDateLong(new Date(p.toExclusive.getTime() - 1))}`;

function head(slug: ReportSlug, ctx: BuildCtx) {
  const meta = REPORTS.find((r) => r.slug === slug)!;
  return {
    slug, title: meta.short, description: meta.description,
    scopeLabel: ctx.scope.combined ? `Gabungan ${ctx.scope.selected.map((c) => c.code).join(" + ")}` : ctx.scope.selected.map((c) => c.code).join(", ") || "-",
    periodLabel: meta.period ? periodLabel(ctx.period) : `Posisi ${fmtDateLong(ctx.now)}`,
  };
}

const companyIds = (ctx: BuildCtx) => ctx.scope.selected.map((c) => c.id);
const sumBy = (rows: Row[], key: string) => sumMoney(rows.map((r) => Number(r[key] ?? 0)));

/** Kelompokkan ke peta berurutan kunci -> baris, lalu ubah jadi baris laporan. */
function groupRows<T>(items: T[], keyOf: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) { const k = keyOf(it); const a = m.get(k); if (a) a.push(it); else m.set(k, [it]); }
  return m;
}

// ---------------------------------------------------------------------------
// 1. Penjualan per periode
// ---------------------------------------------------------------------------
export async function buildSales(ctx: BuildCtx): Promise<ReportData> {
  const invoices = await db.invoice.findMany({
    where: { companyId: { in: companyIds(ctx) }, status: "TERBIT", date: { gte: ctx.period.from, lt: ctx.period.toExclusive } },
    orderBy: { date: "asc" },
    include: {
      company: { select: { code: true } },
      project: { select: { customer: { select: { name: true } }, lines: { select: { qty: true, unitPrice: true, product: { select: { product: { select: { category: true } } } } } } } },
    },
  });
  const flat = invoices.map((i) => ({
    month: monthKey(i.date), company: i.company.code, customer: i.project.customer?.name ?? "(tanpa pelanggan)",
    dpp: num(i.subtotal), ppn: num(i.ppn), total: num(i.total), project: i.project,
  }));
  const money = (items: typeof flat) => ({ count: items.length, dpp: sumMoney(items.map((x) => x.dpp)), ppn: sumMoney(items.map((x) => x.ppn)), total: sumMoney(items.map((x) => x.total)) });
  const moneyCols = (first: ReportCol): ReportCol[] => [first, int("count", "Invoice"), rp("dpp", "DPP"), rp("ppn", "PPN"), rp("total", "Total")];
  const totalsOf = (rows: Row[], first: string): Row => ({ name: first, count: rows.reduce((n, r) => n + Number(r.count), 0), dpp: sumBy(rows, "dpp"), ppn: sumBy(rows, "ppn"), total: sumBy(rows, "total") });

  const byMonth: Row[] = [...groupRows(flat, (x) => x.month)].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ name: monthLabel(k), ...money(v) }));
  const byCustomer: Row[] = [...groupRows(flat, (x) => x.customer)].map(([k, v]) => ({ name: k, ...money(v) })).sort((a, b) => Number(b.dpp) - Number(a.dpp));

  // Invoice tidak menyimpan baris barang, jadi DPP dibagi ke kategori menurut nilai baris pesanan proyeknya.
  const cat = new Map<string, number>();
  for (const x of flat) {
    const lines = x.project.lines.map((l) => ({
      category: CATEGORY_LABEL[(l.product.product?.category ?? "LAINNYA") as ProductCategoryName],
      value: l.qty * num(l.unitPrice),
    }));
    for (const [k, v] of allocateToCategories(x.dpp, lines, CATEGORY_LABEL.LAINNYA)) cat.set(k, sumMoney([cat.get(k) ?? 0, v]));
  }
  const byCategory: Row[] = [...cat].map(([name, dpp]) => ({ name, dpp })).sort((a, b) => Number(b.dpp) - Number(a.dpp));

  const sections: ReportSection[] = [
    { title: "Per bulan", cols: moneyCols(text("name", "Bulan")), rows: byMonth, totals: totalsOf(byMonth, "Total"), empty: "Tidak ada invoice pada periode ini." },
    { title: "Per pelanggan", cols: moneyCols(text("name", "Pelanggan")), rows: byCustomer, totals: totalsOf(byCustomer, "Total"), empty: "Tidak ada invoice pada periode ini." },
    {
      title: "Per kategori produk", note: "DPP invoice dibagi ke kategori menurut nilai baris pesanan proyeknya.",
      cols: [text("name", "Kategori"), rp("dpp", "DPP"), pct("share", "Porsi")],
      rows: byCategory.map((r) => ({ ...r, share: money(flat).dpp > 0 ? (Number(r.dpp) / money(flat).dpp) * 100 : 0 })),
      totals: { name: "Total", dpp: sumBy(byCategory, "dpp"), share: byCategory.length ? 100 : 0 }, empty: "Tidak ada invoice pada periode ini.",
    },
  ];
  if (ctx.scope.combined) {
    const byCompany: Row[] = [...groupRows(flat, (x) => x.company)].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ name: k, ...money(v) }));
    sections.splice(2, 0, { title: "Per perusahaan", cols: moneyCols(text("name", "Perusahaan")), rows: byCompany, totals: totalsOf(byCompany, "Total") });
  }
  const all = money(flat);
  return {
    ...head("penjualan", ctx),
    summary: [
      { label: "Penjualan (DPP)", value: all.dpp, type: "rp", hint: "Tanpa PPN" },
      { label: "PPN", value: all.ppn, type: "rp" },
      { label: "Total tertagih", value: all.total, type: "rp", hint: "Termasuk PPN" },
      { label: "Invoice terbit", value: all.count, type: "int", hint: "Invoice batal tidak dihitung" },
    ],
    sections,
  };
}

// ---------------------------------------------------------------------------
// 2. Piutang aging
// ---------------------------------------------------------------------------
export async function buildReceivables(ctx: BuildCtx): Promise<ReportData> {
  const invoices = await db.invoice.findMany({
    where: { companyId: { in: companyIds(ctx) }, status: "TERBIT" },
    orderBy: { dueDate: "asc" },
    include: { payments: true, company: { select: { code: true } }, project: { select: { customer: { select: { name: true } } } } },
  });
  const open = invoices.map((i) => {
    const paid = paidOf(i.payments);
    const left = sisaTagihan(num(i.total), paid);
    const state = paymentState(num(i.total), paid);
    return { i, left, state, age: daysLate(i.date, ctx.now), overdue: isOverdue(i.dueDate, state, ctx.now), customer: i.project.customer?.name ?? "(tanpa pelanggan)" };
  }).filter((x) => x.state !== "LUNAS" && x.left > 0);

  const buckets = AGING_LABELS.map((label, idx) => {
    const items = open.filter((x) => agingBucket(x.age) === idx);
    return { label, count: items.length, left: sumMoney(items.map((x) => x.left)) };
  });
  const total = sumMoney(open.map((x) => x.left));
  const byAge: Row[] = buckets.map((b) => ({ name: b.label, count: b.count, left: b.left, share: total > 0 ? (b.left / total) * 100 : 0 }));

  const bucketCols = AGING_LABELS.map((l, i) => rp(`b${i}`, l));
  const byCustomer: Row[] = [...groupRows(open, (x) => x.customer)].map(([name, v]) => {
    const row: Row = { name, count: v.length };
    AGING_LABELS.forEach((_, i) => { row[`b${i}`] = sumMoney(v.filter((x) => agingBucket(x.age) === i).map((x) => x.left)); });
    row.total = sumMoney(v.map((x) => x.left));
    return row;
  }).sort((a, b) => Number(b.total) - Number(a.total));

  const dueList = open.filter((x) => daysUntil(x.i.dueDate, ctx.now) <= 7);
  const status = (d: Date) => {
    const n = daysUntil(d, ctx.now);
    return n < 0 ? `Terlambat ${-n} hari` : n === 0 ? "Jatuh tempo hari ini" : `Jatuh tempo ${n} hari lagi`;
  };
  const overdue = open.filter((x) => x.overdue);
  return {
    ...head("piutang", ctx),
    summary: [
      { label: "Total piutang", value: total, type: "rp", hint: `${open.length} invoice belum lunas` },
      { label: "Lewat jatuh tempo", value: sumMoney(overdue.map((x) => x.left)), type: "rp", hint: overdue.length ? `${overdue.length} invoice` : "Tidak ada", tone: overdue.length ? "red" : undefined },
      { label: "Umur lebih dari 90 hari", value: buckets[3].left, type: "rp", hint: `${buckets[3].count} invoice`, tone: buckets[3].count ? "amber" : undefined },
    ],
    sections: [
      { title: "Umur piutang", note: "Umur dihitung dari tanggal invoice sampai hari ini.", cols: [text("name", "Umur"), int("count", "Invoice"), rp("left", "Sisa tagihan"), pct("share", "Porsi")], rows: byAge, totals: { name: "Total", count: open.length, left: total, share: open.length ? 100 : 0 } },
      { title: "Per pelanggan", cols: [text("name", "Pelanggan"), int("count", "Invoice"), ...bucketCols, rp("total", "Total")], rows: byCustomer, empty: "Tidak ada piutang." },
      {
        title: "Jatuh tempo", note: "Invoice yang sudah lewat jatuh tempo atau jatuh tempo dalam 7 hari.",
        cols: [text("number", "Invoice"), text("customer", "Pelanggan"), text("company", "PT"), date("due", "Jatuh tempo"), text("status", "Keterangan"), rp("left", "Sisa tagihan")],
        rows: dueList.map((x) => ({ number: x.i.number, customer: x.customer, company: x.i.company.code, due: x.i.dueDate, status: status(x.i.dueDate), left: x.left })),
        totals: dueList.length ? { number: "Total", left: sumMoney(dueList.map((x) => x.left)) } : undefined, empty: "Tidak ada invoice yang jatuh tempo.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 3. Penerimaan kas
// ---------------------------------------------------------------------------
export async function buildCash(ctx: BuildCtx): Promise<ReportData> {
  const payments = await db.payment.findMany({
    where: { voidedAt: null, date: { gte: ctx.period.from, lt: ctx.period.toExclusive }, invoice: { companyId: { in: companyIds(ctx) } } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: {
      invoice: {
        select: {
          number: true, term: { select: { label: true } },
          company: { select: { code: true, bankName: true, bankAccount: true, bankHolder: true } },
          project: { select: { customer: { select: { name: true } } } },
        },
      },
    },
  });
  const flat = payments.map((p) => {
    const c = p.invoice.company;
    const account = p.method === "TRANSFER"
      ? `${c.code} · ${[c.bankName, c.bankAccount].filter(Boolean).join(" ") || "rekening belum diisi"}${c.bankHolder ? ` a.n. ${c.bankHolder}` : ""}`
      : `${c.code} · ${METHOD_LABEL[p.method]} (kas)`;
    return { p, amount: num(p.amount), kind: termKind(p.invoice.term?.label ?? ""), month: monthKey(p.date), account, customer: p.invoice.project.customer?.name ?? "(tanpa pelanggan)" };
  });
  const amt = (xs: typeof flat) => sumMoney(xs.map((x) => x.amount));
  const grouped = (keyOf: (x: (typeof flat)[number]) => string, sort: (a: string, b: string) => number): Row[] =>
    [...groupRows(flat, keyOf)].sort(([a], [b]) => sort(a, b)).map(([name, v]) => ({ name, count: v.length, amount: amt(v) }));
  const kindOrder = ["DP", "Termin", "Pelunasan"];
  const byKind = grouped((x) => TERM_KIND_LABEL[x.kind], (a, b) => kindOrder.indexOf(a) - kindOrder.indexOf(b));
  const byAccount = grouped((x) => x.account, (a, b) => a.localeCompare(b));
  const byMonth: Row[] = [...groupRows(flat, (x) => x.month)].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ name: monthLabel(k), count: v.length, amount: amt(v) }));
  const cols = (first: string): ReportCol[] => [text("name", first), int("count", "Pembayaran"), rp("amount", "Diterima")];
  const tot = (rows: Row[]): Row => ({ name: "Total", count: rows.reduce((n, r) => n + Number(r.count), 0), amount: sumBy(rows, "amount") });
  const kindAmount = (k: string) => Number(byKind.find((r) => r.name === k)?.amount ?? 0);
  return {
    ...head("kas", ctx),
    summary: [
      { label: "Total diterima", value: amt(flat), type: "rp", hint: `${flat.length} pembayaran (termasuk PPN)` },
      { label: "DP", value: kindAmount("DP"), type: "rp" },
      { label: "Termin", value: kindAmount("Termin"), type: "rp" },
      { label: "Pelunasan", value: kindAmount("Pelunasan"), type: "rp" },
    ],
    sections: [
      { title: "Per jenis", note: "Jenis ditebak dari nama termin (DP, Termin, Pelunasan).", cols: cols("Jenis"), rows: byKind, totals: tot(byKind), empty: "Tidak ada penerimaan pada periode ini." },
      { title: "Per rekening", note: "Transfer ke rekening perusahaan penerbit invoice; pembayaran lain dicatat sebagai kas.", cols: cols("Rekening"), rows: byAccount, totals: tot(byAccount), empty: "Tidak ada penerimaan pada periode ini." },
      { title: "Per bulan", cols: cols("Bulan"), rows: byMonth, totals: tot(byMonth), empty: "Tidak ada penerimaan pada periode ini." },
      {
        title: "Daftar penerimaan",
        cols: [date("date", "Tanggal"), text("receipt", "Kwitansi"), text("customer", "Pelanggan"), text("invoice", "Invoice"), text("kind", "Jenis"), text("method", "Metode"), rp("amount", "Jumlah")],
        rows: flat.map((x) => ({ date: x.p.date, receipt: x.p.receiptNumber, customer: x.customer, invoice: x.p.invoice.number, kind: x.p.invoice.term?.label ?? TERM_KIND_LABEL[x.kind], method: METHOD_LABEL[x.p.method], amount: x.amount })),
        totals: flat.length ? { date: "Total", amount: amt(flat) } : undefined, empty: "Tidak ada penerimaan pada periode ini.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 4. Margin per proyek
// ---------------------------------------------------------------------------
export async function buildMargin(ctx: BuildCtx): Promise<ReportData> {
  const projects = await db.project.findMany({
    where: { kind: "ORDER", status: { not: "BATAL" }, companyId: { in: companyIds(ctx) }, orderDate: { gte: ctx.period.from, lt: ctx.period.toExclusive } },
    orderBy: { orderDate: "asc" },
    include: {
      company: { select: { code: true } }, customer: { select: { name: true } }, costs: { select: { category: true, amount: true } },
      lines: { select: { qty: true, unitPrice: true, product: { select: { product: { select: { type: true, cost: true } } } } } },
    },
  });
  const rows: Row[] = projects.map((p) => {
    const contract = sumMoney(p.lines.map((l) => l.qty * num(l.unitPrice)));
    const material = sumMoney(p.costs.filter((c) => c.category === "BAHAN").map((c) => num(c.amount)));
    const other = sumMoney(p.costs.filter((c) => c.category !== "BAHAN").map((c) => num(c.amount)));
    // Produk dagang dibeli jadi dan tidak memakai bahan dari stok, jadi harga pokoknya dari master produk.
    const trade = sumMoney(p.lines.filter((l) => l.product.product?.type === "DAGANG").map((l) => l.qty * num(l.product.product!.cost)));
    const cost = sumMoney([material, other, trade]);
    const margin = sumMoney([contract, -cost]);
    return {
      project: `${p.code} · ${p.name}`, customer: p.customer?.name ?? "-", company: p.company?.code ?? "-",
      status: p.status === "SELESAI" ? "Selesai" : "Berjalan",
      contract, material, other, trade, cost, margin, pct: contract > 0 ? (margin / contract) * 100 : 0,
    };
  }).sort((a, b) => Number(a.margin) - Number(b.margin));
  const contract = sumBy(rows, "contract");
  const cost = sumBy(rows, "cost");
  const margin = sumMoney([contract, -cost]);
  const negative = rows.filter((r) => Number(r.margin) < 0).length;
  return {
    ...head("margin", ctx),
    summary: [
      { label: "Nilai kontrak", value: contract, type: "rp", hint: `${rows.length} proyek, tanpa PPN` },
      { label: "Total biaya", value: cost, type: "rp" },
      { label: "Margin", value: margin, type: "rp", hint: contract > 0 ? `${((margin / contract) * 100).toFixed(1).replace(".", ",")}% dari kontrak` : undefined },
      { label: "Proyek merugi", value: negative, type: "int", tone: negative ? "red" : undefined },
    ],
    sections: [{
      title: "Margin per proyek", note: "Proyek menurut tanggal order, tidak termasuk yang batal. Proyek berjalan belum memuat seluruh biaya. Diurutkan dari margin terendah.",
      cols: [text("project", "Proyek"), text("customer", "Pelanggan"), text("company", "PT"), text("status", "Status"), rp("contract", "Nilai kontrak"), rp("material", "Biaya bahan"), rp("other", "Tenaga & lain"), rp("trade", "HPP dagang"), rp("cost", "Total biaya"), rp("margin", "Margin"), pct("pct", "Margin %")],
      rows,
      totals: rows.length ? { project: "Total", contract, material: sumBy(rows, "material"), other: sumBy(rows, "other"), trade: sumBy(rows, "trade"), cost, margin, pct: contract > 0 ? (margin / contract) * 100 : 0 } : undefined,
      empty: "Tidak ada proyek pada periode ini.",
    }],
  };
}

// ---------------------------------------------------------------------------
// 5. Status DP dan termin
// ---------------------------------------------------------------------------
const TERM_STATE = ["Lewat jatuh tempo", "Menunggu bayar", "Dibayar sebagian", "Belum ditagih"] as const;

export async function buildTerms(ctx: BuildCtx): Promise<ReportData> {
  const projects = await db.project.findMany({
    where: { kind: "ORDER", status: { not: "BATAL" }, companyId: { in: companyIds(ctx) } },
    orderBy: { orderDate: "asc" },
    include: {
      company: { select: { code: true } }, customer: { select: { name: true } }, lines: { select: { qty: true, unitPrice: true } },
      terms: { orderBy: { seq: "asc" }, include: { invoices: { where: { status: "TERBIT" }, include: { payments: true } } } },
    },
  });
  type Item = { state: (typeof TERM_STATE)[number]; row: Row; left: number; due: Date | null };
  const items: Item[] = [];
  for (const p of projects) {
    if (p.terms.length === 0) continue;
    const amounts = termAmounts(orderAmounts(p.lines.map((l) => ({ qty: l.qty, unitPrice: num(l.unitPrice) })), num(p.ppnRate)), p.terms.map((t) => num(t.percent)));
    p.terms.forEach((t, idx) => {
      const billed = sumMoney(t.invoices.map((i) => num(i.total)));
      const paid = sumMoney(t.invoices.map((i) => paidOf(i.payments)));
      const expected = amounts[idx].total;
      const base = t.invoices.length ? billed : expected;
      const left = sisaTagihan(base, paid);
      if (left <= 0 && t.invoices.length) return; // lunas
      const due = t.invoices.length ? t.invoices.map((i) => i.dueDate).sort((a, b) => a.getTime() - b.getTime())[0] : null;
      const late = t.invoices.some((i) => isOverdue(i.dueDate, paymentState(num(i.total), paidOf(i.payments)), ctx.now));
      const state: Item["state"] = !t.invoices.length ? "Belum ditagih" : late ? "Lewat jatuh tempo" : paid > 0 ? "Dibayar sebagian" : "Menunggu bayar";
      items.push({
        state, left, due,
        row: {
          project: p.code, customer: p.customer?.name ?? "-", company: p.company?.code ?? "-",
          term: `${t.label} ${num(t.percent)}%`, kind: TERM_KIND_LABEL[termKind(t.label)], trigger: t.trigger,
          invoice: t.invoices.map((i) => i.number).join(", ") || "-", due, state, amount: base, paid, left,
        },
      });
    });
  }
  items.sort((a, b) => TERM_STATE.indexOf(a.state) - TERM_STATE.indexOf(b.state) || (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity));
  const of = (s: Item["state"]) => items.filter((i) => i.state === s);
  const dpOpen = items.filter((i) => i.row.kind === "DP");
  const rows = items.map((i) => i.row);
  return {
    ...head("termin", ctx),
    summary: [
      { label: "Lewat jatuh tempo", value: sumMoney(of("Lewat jatuh tempo").map((i) => i.left)), type: "rp", hint: `${of("Lewat jatuh tempo").length} termin`, tone: of("Lewat jatuh tempo").length ? "red" : undefined },
      { label: "Menunggu bayar", value: sumMoney([...of("Menunggu bayar"), ...of("Dibayar sebagian")].map((i) => i.left)), type: "rp", hint: `${of("Menunggu bayar").length + of("Dibayar sebagian").length} termin` },
      { label: "Belum ditagih", value: sumMoney(of("Belum ditagih").map((i) => i.left)), type: "rp", hint: `${of("Belum ditagih").length} termin, nilai menurut termin proyek` },
      { label: "DP belum lunas", value: sumMoney(dpOpen.map((i) => i.left)), type: "rp", hint: `${dpOpen.length} proyek` },
    ],
    sections: [{
      title: "DP dan termin belum lunas", note: "Nilai termasuk PPN. Termin yang belum ditagih memakai nilai menurut persen termin proyek.",
      cols: [text("project", "Proyek"), text("customer", "Pelanggan"), text("company", "PT"), text("term", "Termin"), text("invoice", "Invoice"), date("due", "Jatuh tempo"), text("state", "Status"), rp("amount", "Nilai"), rp("left", "Sisa")],
      rows, totals: rows.length ? { project: "Total", amount: sumBy(rows, "amount"), left: sumBy(rows, "left") } : undefined,
      empty: "Semua DP dan termin sudah lunas.",
    }],
  };
}

// ---------------------------------------------------------------------------
// 6. Rekap PPN keluaran
// ---------------------------------------------------------------------------
export async function buildVat(ctx: BuildCtx): Promise<ReportData> {
  const invoices = await db.invoice.findMany({
    where: {
      companyId: { in: companyIds(ctx) }, status: "TERBIT", ppnRate: { gt: 0 },
      date: { gte: ctx.period.from, lt: ctx.period.toExclusive },
    },
    orderBy: [{ date: "asc" }, { number: "asc" }],
    include: { company: { select: { code: true } }, project: { select: { customer: { select: { name: true, taxId: true } } } } },
  });
  const flat = invoices.map((i) => ({ i, month: monthKey(i.date), dpp: num(i.subtotal), ppn: num(i.ppn), company: i.company.code }));
  const groupedRows = [...groupRows(flat, (x) => `${x.month}|${x.company}`)].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]): Row => ({
    name: monthLabel(k.split("|")[0]), company: v[0].company, count: v.length, dpp: sumMoney(v.map((x) => x.dpp)), ppn: sumMoney(v.map((x) => x.ppn)),
  }));
  const dpp = sumMoney(flat.map((x) => x.dpp));
  const ppn = sumMoney(flat.map((x) => x.ppn));
  return {
    ...head("ppn", ctx),
    summary: [
      { label: "DPP kena PPN", value: dpp, type: "rp", hint: `${flat.length} invoice` },
      { label: "PPN keluaran", value: ppn, type: "rp", hint: "Invoice batal tidak dihitung" },
      { label: "Total tertagih", value: sumMoney([dpp, ppn]), type: "rp" },
    ],
    sections: [
      {
        title: "Per bulan", note: "Hanya invoice perusahaan kena PPN. Perusahaan non-PPN (GTF) tidak muncul di sini.",
        cols: [text("name", "Bulan"), text("company", "PT"), int("count", "Invoice"), rp("dpp", "DPP"), rp("ppn", "PPN")],
        rows: groupedRows, totals: groupedRows.length ? { name: "Total", count: flat.length, dpp, ppn } : undefined,
        empty: "Tidak ada invoice kena PPN pada periode ini.",
      },
      {
        title: "Daftar invoice",
        cols: [date("date", "Tanggal"), text("number", "Invoice"), text("customer", "Pelanggan"), text("npwp", "NPWP"), text("company", "PT"), rp("dpp", "DPP"), pct("rate", "Tarif"), rp("ppn", "PPN")],
        rows: flat.map((x) => ({ date: x.i.date, number: x.i.number, customer: x.i.project.customer?.name ?? "-", npwp: x.i.project.customer?.taxId ?? "-", company: x.company, dpp: x.dpp, rate: num(x.i.ppnRate), ppn: x.ppn })),
        totals: flat.length ? { date: "Total", dpp, ppn } : undefined, empty: "Tidak ada invoice kena PPN pada periode ini.",
      },
    ],
  };
}

export const BUILDERS: Record<ReportSlug, (ctx: BuildCtx) => Promise<ReportData>> = {
  penjualan: buildSales, piutang: buildReceivables, kas: buildCash, margin: buildMargin, termin: buildTerms, ppn: buildVat,
};
