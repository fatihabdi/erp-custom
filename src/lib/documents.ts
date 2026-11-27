import type { Prisma } from "@/generated/prisma/client";
import { issueDocNumber } from "@/lib/doc-number";
import { NotFoundError } from "@/lib/inventory";
import { createProject, lock } from "@/lib/project";
import { createProductionOrder } from "@/lib/sales-order";
import {
  addDays, DocumentRuleError, orderAmounts, paymentPurpose, paymentState, sisaTagihan, termAmounts, toCents,
  validatePayment, validateTerms, type MethodName, type TermInput,
} from "@/lib/billing";

type Tx = Prisma.TransactionClient;
const num = (d: Prisma.Decimal | number) => Number(d);

// ---------------------------------------------------------------------------
// Penawaran
// ---------------------------------------------------------------------------

export type QuotationLineInput = { description: string; spec?: string | null; qty: number; unit: string; unitPrice: number; productId?: string | null };

export type QuotationInput = {
  companyId: string;
  customerId: string;
  date?: Date;
  attn?: string | null;
  subject: string;
  notes?: string | null;
  lines: QuotationLineInput[];
  terms: TermInput[];
};

function checkLines(lines: QuotationLineInput[]) {
  if (lines.length === 0) throw new DocumentRuleError("Tambahkan minimal satu barang.");
  for (const l of lines) {
    if (!l.description.trim()) throw new DocumentRuleError("Uraian barang wajib diisi.");
    if (!l.unit.trim()) throw new DocumentRuleError("Satuan wajib diisi.");
    if (!Number.isInteger(l.qty) || l.qty <= 0) throw new DocumentRuleError("Jumlah harus bilangan bulat positif.");
    if (!Number.isFinite(l.unitPrice) || l.unitPrice < 0) throw new DocumentRuleError("Harga tidak boleh negatif.");
  }
}

const lineData = (l: QuotationLineInput, i: number) => ({
  sort: i, description: l.description.trim(), spec: l.spec?.trim() || null, qty: l.qty, unit: l.unit.trim(),
  unitPrice: l.unitPrice, productId: l.productId || null,
});
const termData = (t: TermInput, i: number) => ({
  seq: i + 1, label: t.label.trim(), trigger: t.trigger.trim(), percent: t.percent, dueDays: t.dueDays,
});

export async function createQuotation(tx: Tx, input: QuotationInput & { userId?: string | null }) {
  if (!input.subject.trim()) throw new DocumentRuleError("Perihal wajib diisi.");
  checkLines(input.lines);
  validateTerms(input.terms);
  const company = await tx.company.findUnique({ where: { id: input.companyId } });
  if (!company?.active) throw new DocumentRuleError("Perusahaan tidak valid.");
  const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
  if (!customer?.active) throw new DocumentRuleError("Pelanggan tidak valid.");
  const date = input.date ?? new Date();
  const number = await issueDocNumber(tx, { companyId: company.id, companyCode: company.code, docType: "SPH", date });
  return tx.quotation.create({
    data: {
      companyId: company.id, customerId: customer.id, number, date,
      attn: input.attn?.trim() || null, subject: input.subject.trim(), notes: input.notes?.trim() || null,
      ppnRate: company.ppnRate, createdById: input.userId ?? null,
      lines: { create: input.lines.map(lineData) },
      terms: { create: input.terms.map(termData) },
    },
  });
}

/** Penawaran hanya bisa diubah selama draf. Nomor, perusahaan, dan tanggal tidak berubah. */
export async function updateQuotation(tx: Tx, id: string, input: Omit<QuotationInput, "companyId" | "date">) {
  await lock(tx, `quotation:${id}`);
  const q = await tx.quotation.findUnique({ where: { id } });
  if (!q) throw new NotFoundError("Penawaran tidak ditemukan.");
  if (q.status !== "DRAFT") throw new DocumentRuleError("Hanya penawaran berstatus draf yang bisa diubah.");
  if (!input.subject.trim()) throw new DocumentRuleError("Perihal wajib diisi.");
  checkLines(input.lines);
  validateTerms(input.terms);
  const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
  if (!customer?.active) throw new DocumentRuleError("Pelanggan tidak valid.");
  await tx.quotationLine.deleteMany({ where: { quotationId: id } });
  await tx.paymentTerm.deleteMany({ where: { quotationId: id } });
  return tx.quotation.update({
    where: { id },
    data: {
      customerId: customer.id, attn: input.attn?.trim() || null, subject: input.subject.trim(), notes: input.notes?.trim() || null,
      lines: { create: input.lines.map(lineData) },
      terms: { create: input.terms.map(termData) },
    },
  });
}

type QStatus = "DRAFT" | "TERKIRIM" | "DISETUJUI" | "DITOLAK" | "BATAL";
export const QUOTATION_FLOW: Record<QStatus, QStatus[]> = {
  DRAFT: ["TERKIRIM", "BATAL"],
  TERKIRIM: ["DISETUJUI", "DITOLAK", "DRAFT", "BATAL"],
  DISETUJUI: [],
  DITOLAK: ["TERKIRIM"],
  BATAL: [],
};
export const QUOTATION_LABEL: Record<QStatus, string> = {
  DRAFT: "Draf", TERKIRIM: "Terkirim", DISETUJUI: "Disetujui", DITOLAK: "Ditolak", BATAL: "Dibatalkan",
};

export async function setQuotationStatus(tx: Tx, id: string, to: QStatus) {
  await lock(tx, `quotation:${id}`);
  const q = await tx.quotation.findUnique({ where: { id }, include: { order: true } });
  if (!q) throw new NotFoundError("Penawaran tidak ditemukan.");
  if (!QUOTATION_FLOW[q.status].includes(to)) {
    throw new DocumentRuleError(`Status ${QUOTATION_LABEL[q.status]} tidak bisa diubah menjadi ${QUOTATION_LABEL[to]}.`);
  }
  if (q.order) throw new DocumentRuleError("Penawaran ini sudah menjadi Konfirmasi Order.");
  return tx.quotation.update({ where: { id }, data: { status: to } });
}

// ---------------------------------------------------------------------------
// Konfirmasi Order
// ---------------------------------------------------------------------------

export type OrderDocInput = {
  date?: Date;
  deliveryLocation?: string | null;
  workDays?: number | null;
  notes?: string | null;
  dueDate?: Date | null;
  userId?: string | null;
};

function checkOrderDoc(i: OrderDocInput) {
  if (i.workDays != null && (!Number.isInteger(i.workDays) || i.workDays <= 0 || i.workDays > 999)) {
    throw new DocumentRuleError("Waktu pengerjaan harus bilangan bulat positif (hari kerja).");
  }
}

/**
 * Ubah penawaran menjadi Konfirmasi Order: menerbitkan nomor KO, membuat proyek pesanan dari baris penawaran,
 * dan menyalin termin. Setiap baris harus sudah dikaitkan ke barang jadi (`productIds` melengkapi baris yang belum).
 */
export async function convertQuotationToOrder(
  tx: Tx,
  quotationId: string,
  input: OrderDocInput & { productIds?: Record<string, string> },
) {
  checkOrderDoc(input);
  await lock(tx, `quotation:${quotationId}`);
  const q = await tx.quotation.findUnique({ where: { id: quotationId }, include: { lines: { orderBy: { sort: "asc" } }, terms: { orderBy: { seq: "asc" } }, company: true, order: true } });
  if (!q) throw new NotFoundError("Penawaran tidak ditemukan.");
  if (q.order) throw new DocumentRuleError("Penawaran ini sudah menjadi Konfirmasi Order.");
  if (q.status === "DITOLAK" || q.status === "BATAL") throw new DocumentRuleError("Penawaran yang ditolak atau dibatalkan tidak bisa dijadikan order.");

  const lines = q.lines.map((l) => ({ ...l, productId: l.productId ?? input.productIds?.[l.id] ?? null }));
  const missing = lines.find((l) => !l.productId);
  if (missing) throw new DocumentRuleError(`Hubungkan "${missing.description}" ke barang jadi di katalog.`);

  const date = input.date ?? new Date();
  const number = await issueDocNumber(tx, { companyId: q.companyId, companyCode: q.company.code, docType: "KO", date });
  for (const l of lines) {
    if (l.productId !== q.lines.find((x) => x.id === l.id)?.productId) {
      await tx.quotationLine.update({ where: { id: l.id }, data: { productId: l.productId } });
    }
  }
  const project = await createProject(tx, {
    kind: "ORDER", name: q.subject, companyId: q.companyId, customerId: q.customerId, orderRef: number,
    orderDate: date, dueDate: input.dueDate ?? null, userId: input.userId,
    lines: lines.map((l) => ({ productId: l.productId!, qty: l.qty, unitPrice: num(l.unitPrice) })),
  });
  await tx.paymentTerm.createMany({
    data: q.terms.map((t) => ({ projectId: project.id, seq: t.seq, label: t.label, trigger: t.trigger, percent: t.percent, dueDays: t.dueDays })),
  });
  const order = await tx.salesOrder.create({
    data: {
      companyId: q.companyId, projectId: project.id, quotationId: q.id, number, date,
      deliveryLocation: input.deliveryLocation?.trim() || null, workDays: input.workDays ?? null,
      notes: input.notes?.trim() || null, createdById: input.userId ?? null,
    },
  });
  await createProductionOrder(tx, order.id, q.lines.map((l) => ({ title: l.description, spec: l.spec })));
  await tx.quotation.update({ where: { id: q.id }, data: { status: "DISETUJUI" } });
  return { order, projectId: project.id };
}

/** Buat Konfirmasi Order dari proyek pesanan yang sudah ada (barang, harga, dan pelanggan diambil dari proyek). */
export async function createOrderFromProject(
  tx: Tx,
  projectId: string,
  input: OrderDocInput & { terms?: TermInput[] },
) {
  checkOrderDoc(input);
  await lock(tx, `project-docs:${projectId}`);
  const p = await tx.project.findUnique({ where: { id: projectId }, include: { company: true, salesOrder: true, terms: true } });
  if (!p) throw new NotFoundError("Proyek tidak ditemukan.");
  if (p.kind !== "ORDER" || !p.company || !p.customerId) throw new DocumentRuleError("Konfirmasi Order hanya untuk proyek pesanan pelanggan.");
  if (p.status === "BATAL") throw new DocumentRuleError("Proyek ini dibatalkan.");
  if (p.salesOrder) throw new DocumentRuleError("Proyek ini sudah punya Konfirmasi Order.");
  if (p.terms.length === 0) {
    if (!input.terms) throw new DocumentRuleError("Isi termin pembayaran.");
    validateTerms(input.terms);
    await tx.paymentTerm.createMany({ data: input.terms.map((t, i) => ({ ...termData(t, i), projectId })) });
  }
  const date = input.date ?? new Date();
  const number = await issueDocNumber(tx, { companyId: p.company.id, companyCode: p.company.code, docType: "KO", date });
  if (!p.orderRef) await tx.project.update({ where: { id: projectId }, data: { orderRef: number } });
  if (input.dueDate) await tx.project.update({ where: { id: projectId }, data: { dueDate: input.dueDate } });
  const order = await tx.salesOrder.create({
    data: {
      companyId: p.company.id, projectId, number, date,
      deliveryLocation: input.deliveryLocation?.trim() || null, workDays: input.workDays ?? null,
      notes: input.notes?.trim() || null, createdById: input.userId ?? null,
    },
  });
  await createProductionOrder(tx, order.id);
  return order;
}

export async function updateOrderDoc(tx: Tx, orderId: string, input: Omit<OrderDocInput, "date">) {
  checkOrderDoc(input);
  const o = await tx.salesOrder.findUnique({ where: { id: orderId } });
  if (!o) throw new NotFoundError("Konfirmasi Order tidak ditemukan.");
  if (input.dueDate !== undefined) await tx.project.update({ where: { id: o.projectId }, data: { dueDate: input.dueDate } });
  return tx.salesOrder.update({
    where: { id: orderId },
    data: { deliveryLocation: input.deliveryLocation?.trim() || null, workDays: input.workDays ?? null, notes: input.notes?.trim() || null },
  });
}

export async function markOrderSigned(tx: Tx, orderId: string, signed: boolean) {
  const o = await tx.salesOrder.findUnique({ where: { id: orderId } });
  if (!o) throw new NotFoundError("Konfirmasi Order tidak ditemukan.");
  return tx.salesOrder.update({ where: { id: orderId }, data: { signedAt: signed ? new Date() : null } });
}

/** Ganti skema termin proyek. Hanya sebelum ada invoice yang terbit. */
export async function setProjectTerms(tx: Tx, projectId: string, terms: TermInput[]) {
  validateTerms(terms);
  await lock(tx, `project-docs:${projectId}`);
  const p = await tx.project.findUnique({ where: { id: projectId } });
  if (!p) throw new NotFoundError("Proyek tidak ditemukan.");
  const issued = await tx.invoice.count({ where: { projectId, status: "TERBIT" } });
  if (issued > 0) throw new DocumentRuleError("Termin tidak bisa diubah karena sudah ada invoice yang terbit. Batalkan invoice lebih dulu.");
  await tx.invoice.updateMany({ where: { projectId }, data: { termId: null } });
  await tx.paymentTerm.deleteMany({ where: { projectId } });
  await tx.paymentTerm.createMany({ data: terms.map((t, i) => ({ ...termData(t, i), projectId })) });
}

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------

/** Nilai order dan jumlah tiap termin sebuah proyek (tanpa menyentuh invoice). */
export async function projectTermPlan(tx: Tx, projectId: string) {
  const p = await tx.project.findUnique({
    where: { id: projectId },
    include: {
      lines: { orderBy: { sort: "asc" }, include: { product: { select: { name: true, unit: true } } } },
      terms: { orderBy: { seq: "asc" } },
    },
  });
  if (!p) throw new NotFoundError("Proyek tidak ditemukan.");
  const order = orderAmounts(p.lines.map((l) => ({ qty: l.qty, unitPrice: num(l.unitPrice) })), num(p.ppnRate));
  const amounts = termAmounts(order, p.terms.map((t) => num(t.percent)));
  return { project: p, order, terms: p.terms.map((t, i) => ({ ...t, percent: num(t.percent), amount: amounts[i] })) };
}

export async function createInvoice(
  tx: Tx,
  input: { projectId: string; termId: string; date?: Date; dueDate?: Date | null; deliveryId?: string | null; userId?: string | null },
) {
  await lock(tx, `project-docs:${input.projectId}`);
  const plan = await projectTermPlan(tx, input.projectId);
  const { project } = plan;
  if (project.kind !== "ORDER" || !project.companyId) throw new DocumentRuleError("Invoice hanya untuk proyek pesanan pelanggan.");
  if (project.status === "BATAL") throw new DocumentRuleError("Proyek ini dibatalkan.");
  const so = await tx.salesOrder.findUnique({ where: { projectId: project.id } });
  if (!so) throw new DocumentRuleError("Buat Konfirmasi Order lebih dulu sebelum menerbitkan invoice.");
  const term = plan.terms.find((t) => t.id === input.termId);
  if (!term) throw new DocumentRuleError("Termin tidak ditemukan di proyek ini.");
  const existing = await tx.invoice.findFirst({ where: { termId: term.id, status: "TERBIT" } });
  if (existing) throw new DocumentRuleError(`Termin ${term.label} sudah ditagih di invoice ${existing.number}.`);

  let detail: string;
  if (input.deliveryId) {
    const d = await tx.delivery.findUnique({
      where: { id: input.deliveryId }, include: { lines: { include: { line: { include: { product: { select: { name: true, unit: true } } } } } } },
    });
    if (!d || d.projectId !== project.id) throw new DocumentRuleError("Pengiriman tidak ditemukan di proyek ini.");
    if (d.status === "BATAL") throw new DocumentRuleError("Pengiriman ini dibatalkan.");
    detail = `Pengiriman ke-${d.seq}: ${d.lines.map((l) => `${l.qty} ${l.line.product.unit} ${l.line.product.name}`).join(", ")}`;
  } else {
    detail = plan.project.lines.map((l) => `${l.qty} ${l.product.unit} ${l.product.name}`).join(", ");
  }

  const date = input.date ?? new Date();
  const company = await tx.company.findUniqueOrThrow({ where: { id: project.companyId } });
  const number = await issueDocNumber(tx, { companyId: company.id, companyCode: company.code, docType: "INV", date });
  const ref = so.number;
  const pct = Number.isInteger(term.percent) ? `${term.percent}` : String(term.percent).replace(".", ",");
  return tx.invoice.create({
    data: {
      companyId: company.id, projectId: project.id, termId: term.id, deliveryId: input.deliveryId ?? null,
      number, date, dueDate: input.dueDate ?? addDays(date, term.dueDays),
      description: `${term.label} ${pct}% pesanan ${ref}`, detail,
      orderValue: plan.order.subtotal, percent: term.percent,
      subtotal: term.amount.subtotal, ppnRate: project.ppnRate, ppn: term.amount.ppn, total: term.amount.total,
      createdById: input.userId ?? null,
    },
  });
}

export async function voidInvoice(tx: Tx, invoiceId: string, reason: string) {
  if (!reason.trim()) throw new DocumentRuleError("Tulis alasan pembatalan invoice.");
  const inv0 = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv0) throw new NotFoundError("Invoice tidak ditemukan.");
  await lock(tx, `project-docs:${inv0.projectId}`);
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: true } });
  if (inv.status === "BATAL") throw new DocumentRuleError("Invoice ini sudah dibatalkan.");
  if (inv.payments.some((p) => !p.voidedAt)) throw new DocumentRuleError("Invoice sudah ada pembayaran. Batalkan kwitansinya lebih dulu.");
  return tx.invoice.update({ where: { id: invoiceId }, data: { status: "BATAL", voidReason: reason.trim() } });
}

// ---------------------------------------------------------------------------
// Pembayaran dan kwitansi
// ---------------------------------------------------------------------------

export const paidOf = (payments: { amount: Prisma.Decimal | number; voidedAt: Date | null }[]) =>
  payments.filter((p) => !p.voidedAt).reduce((n, p) => n + toCents(num(p.amount)), 0) / 100;

export async function recordPayment(
  tx: Tx,
  input: { invoiceId: string; amount: number; date?: Date; method?: MethodName; note?: string | null; userId?: string | null },
) {
  const found = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
  if (!found) throw new NotFoundError("Invoice tidak ditemukan.");
  await lock(tx, `invoice:${found.id}`);
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: found.id }, include: { payments: true, term: true } });
  if (inv.status === "BATAL") throw new DocumentRuleError("Invoice ini dibatalkan.");
  const total = num(inv.total);
  const paid = paidOf(inv.payments);
  validatePayment(total, paid, input.amount);

  const date = input.date ?? new Date();
  const company = await tx.company.findUniqueOrThrow({ where: { id: inv.companyId } });
  const receiptNumber = await issueDocNumber(tx, { companyId: company.id, companyCode: company.code, docType: "KW", date });
  const amount = Math.round(input.amount * 100) / 100;
  const balanceAfter = sisaTagihan(total, paid + amount);
  return tx.payment.create({
    data: {
      invoiceId: inv.id, receiptNumber, date, amount, method: input.method ?? "TRANSFER",
      note: input.note?.trim() || null, balanceAfter, createdById: input.userId ?? null,
    },
  });
}

/** Batalkan kwitansi (koreksi salah catat). Nomor tetap tercatat; pembayaran tidak lagi dihitung. */
export async function voidPayment(tx: Tx, paymentId: string, reason: string) {
  if (!reason.trim()) throw new DocumentRuleError("Tulis alasan pembatalan kwitansi.");
  const p0 = await tx.payment.findUnique({ where: { id: paymentId } });
  if (!p0) throw new NotFoundError("Kwitansi tidak ditemukan.");
  await lock(tx, `invoice:${p0.invoiceId}`);
  const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (p.voidedAt) throw new DocumentRuleError("Kwitansi ini sudah dibatalkan.");
  return tx.payment.update({ where: { id: paymentId }, data: { voidedAt: new Date(), voidReason: reason.trim() } });
}

export { paymentPurpose, paymentState };
