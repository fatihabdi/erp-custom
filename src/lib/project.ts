import type { Prisma } from "@/generated/prisma/client";
import {
  checkMaterialAvailability, issueMaterialsForProduction, NotFoundError, receiveFinishedGoodsAtQc, shipFinishedGoods,
} from "@/lib/inventory";
import {
  emptyStageDone, isProjectComplete, projectCode, ProjectRuleError, STAGES, stagesFor, validateDeliveryPlan,
  validateShipment, validateStageDone, type LineQty, type ManualStage, type StageDone, type StageName,
} from "@/lib/production";

type Tx = Prisma.TransactionClient;
const num = (d: Prisma.Decimal | number) => Number(d);

export async function lock(tx: Tx, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

/** Kunci per proyek: semua perubahan progres, bahan, QC, dan kirim berjalan satu per satu. */
async function lockProject(tx: Tx, projectId: string) {
  await lock(tx, `project:${projectId}`);
  const project = await tx.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError("Proyek tidak ditemukan.");
  return project;
}

function ensureActive(p: { status: string }) {
  if (p.status !== "BERJALAN") throw new ProjectRuleError("Proyek ini sudah tidak berjalan.");
}

export type LineWithProgress = {
  id: string; productId: string; qty: number; unitPrice: number; issuedUnits: number; done: StageDone;
  held: Partial<Record<StageName, { note: string | null }>>;
};

export async function loadLines(tx: Tx, projectId: string): Promise<LineWithProgress[]> {
  const lines = await tx.projectLine.findMany({
    where: { projectId }, orderBy: { sort: "asc" }, include: { stages: true },
  });
  return lines.map((l) => {
    const done = emptyStageDone();
    const held: LineWithProgress["held"] = {};
    for (const s of l.stages) {
      done[s.stage] = s.done;
      if (s.held) held[s.stage] = { note: s.holdNote };
    }
    return { id: l.id, productId: l.productId, qty: l.qty, unitPrice: num(l.unitPrice), issuedUnits: l.issuedUnits, done, held };
  });
}

async function loadLine(tx: Tx, lineId: string) {
  const line = await tx.projectLine.findUnique({ where: { id: lineId }, include: { product: true, project: true } });
  if (!line) throw new NotFoundError("Barang proyek tidak ditemukan.");
  const project = await lockProject(tx, line.projectId);
  // Muat ulang setelah kunci supaya angka yang dipakai validasi terbaru.
  const fresh = await tx.projectLine.findUniqueOrThrow({ where: { id: lineId }, include: { product: true, stages: true } });
  const done = emptyStageDone();
  for (const s of fresh.stages) done[s.stage] = s.done;
  return { line: fresh, project, done };
}

async function bump(tx: Tx, lineId: string, stage: StageName, by: number) {
  await tx.projectStage.upsert({
    where: { lineId_stage: { lineId, stage } },
    create: { lineId, stage, done: by },
    update: { done: { increment: by } },
  });
}

/** Tandai proyek selesai bila semua tahap yang berlaku sudah penuh. */
async function completeIfDone(tx: Tx, projectId: string) {
  const p = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
  if (p.status !== "BERJALAN") return false;
  const lines = await loadLines(tx, projectId);
  if (isProjectComplete(lines, stagesFor(p.kind))) {
    await tx.project.update({ where: { id: projectId }, data: { status: "SELESAI" } });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------

export type NewProject = {
  kind: "ORDER" | "STOK";
  name: string;
  companyId?: string | null;
  customerId?: string | null;
  orderRef?: string | null;
  orderDate?: Date;
  dueDate?: Date | null;
  notes?: string | null;
  lines: { productId: string; qty: number; unitPrice?: number }[];
  userId?: string | null;
};

export async function createProject(tx: Tx, input: NewProject) {
  if (!input.name.trim()) throw new ProjectRuleError("Nama proyek wajib diisi.");
  if (input.lines.length === 0) throw new ProjectRuleError("Tambahkan minimal satu barang.");
  for (const l of input.lines) {
    if (!Number.isInteger(l.qty) || l.qty <= 0) throw new ProjectRuleError("Jumlah harus bilangan bulat positif.");
    if ((l.unitPrice ?? 0) < 0) throw new ProjectRuleError("Harga tidak boleh negatif.");
  }
  let ppnRate = 0;
  let companyId: string | null = null;
  let customerId: string | null = null;
  if (input.kind === "ORDER") {
    if (!input.companyId) throw new ProjectRuleError("Pilih perusahaan.");
    if (!input.customerId) throw new ProjectRuleError("Pilih pelanggan.");
    const company = await tx.company.findUnique({ where: { id: input.companyId } });
    if (!company?.active) throw new ProjectRuleError("Perusahaan tidak valid.");
    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer?.active) throw new ProjectRuleError("Pelanggan tidak valid.");
    companyId = company.id;
    customerId = customer.id;
    ppnRate = num(company.ppnRate);
  }
  const products = await tx.item.findMany({ where: { id: { in: input.lines.map((l) => l.productId) } } });
  const ok = new Set(products.filter((p) => p.kind === "FINISHED" && p.active).map((p) => p.id));
  if (input.lines.some((l) => !ok.has(l.productId))) throw new ProjectRuleError("Barang harus berupa barang jadi yang aktif.");

  const year = (input.orderDate ?? new Date()).getFullYear();
  const prefix = input.kind === "ORDER" ? "PRY" : "STK";
  await lock(tx, `project-code:${prefix}-${year}`);
  const existing = await tx.project.findMany({ where: { code: { startsWith: `${prefix}-${year}-` } }, select: { code: true } });
  const max = existing.reduce((m, r) => Math.max(m, parseInt(r.code.split("-")[2], 10) || 0), 0);

  const stages = stagesFor(input.kind);
  return tx.project.create({
    data: {
      code: projectCode(input.kind, year, max + 1),
      kind: input.kind,
      name: input.name.trim(),
      companyId, customerId, ppnRate,
      orderRef: input.orderRef?.trim() || null,
      orderDate: input.orderDate ?? new Date(),
      dueDate: input.dueDate ?? null,
      notes: input.notes?.trim() || null,
      createdById: input.userId ?? null,
      lines: {
        create: input.lines.map((l, i) => ({
          productId: l.productId, qty: l.qty, sort: i,
          unitPrice: input.kind === "ORDER" ? (l.unitPrice ?? 0) : 0,
          stages: { create: stages.map((stage) => ({ stage })) },
        })),
      },
    },
  });
}

/**
 * Keluarkan bahan baku (sesuai BOM) untuk `units` unit sebuah baris. Memanggil fungsi stok Inventory
 * (semua-atau-tidak-sama-sekali), lalu mencatat nilai bahan sebagai biaya proyek.
 */
export async function issueMaterials(tx: Tx, p: { lineId: string; units: number; userId?: string | null }) {
  const { line, project } = await loadLine(tx, p.lineId);
  ensureActive(project);
  if (!Number.isInteger(p.units) || p.units <= 0) throw new ProjectRuleError("Jumlah unit harus bilangan bulat positif.");
  const left = line.qty - line.issuedUnits;
  if (p.units > left) throw new ProjectRuleError(`Bahan hanya bisa dikeluarkan untuk ${left} unit lagi.`);

  const issue = await tx.materialIssue.create({ data: { lineId: line.id, units: p.units, cost: 0, userId: p.userId ?? null } });
  const { required } = await checkMaterialAvailability(tx, line.productId, p.units);
  const mats = await tx.item.findMany({ where: { id: { in: required.map((r) => r.materialId) } }, select: { id: true, unitCost: true } });
  const unitCost = new Map(mats.map((m) => [m.id, num(m.unitCost)]));
  const cost = Math.round(required.reduce((n, r) => n + r.qty * (unitCost.get(r.materialId) ?? 0), 0) * 100) / 100;

  await issueMaterialsForProduction(tx, { productId: line.productId, units: p.units, productionId: issue.id, userId: p.userId });
  await tx.materialIssue.update({ where: { id: issue.id }, data: { cost } });
  await tx.projectLine.update({ where: { id: line.id }, data: { issuedUnits: { increment: p.units } } });
  await tx.projectCost.create({
    data: {
      projectId: project.id, category: "BAHAN", amount: cost, source: "STOK", refId: issue.id, userId: p.userId ?? null,
      description: `Bahan ${p.units} × ${line.product.name}`,
    },
  });
  return { issueId: issue.id, cost };
}

/** Perbarui jumlah selesai sebuah tahap (rangka besi, potong kayu, rakit, finishing, packing) dan status tertahan. */
export async function updateStage(
  tx: Tx,
  p: { lineId: string; stage: ManualStage; done: number; held?: boolean; holdNote?: string | null },
) {
  const { line, project, done } = await loadLine(tx, p.lineId);
  ensureActive(project);
  if (!stagesFor(project.kind).includes(p.stage)) throw new ProjectRuleError("Tahap ini tidak berlaku untuk proyek ini.");
  validateStageDone(p.stage, p.done, done, line.qty, line.issuedUnits);
  const held = p.held ?? false;
  if (held && !p.holdNote?.trim()) throw new ProjectRuleError("Tulis alasan tahap tertahan.");
  await tx.projectStage.upsert({
    where: { lineId_stage: { lineId: line.id, stage: p.stage } },
    create: { lineId: line.id, stage: p.stage, done: p.done, held, holdNote: held ? p.holdNote!.trim() : null },
    update: { done: p.done, held, holdNote: held ? p.holdNote!.trim() : null },
  });
  await completeIfDone(tx, project.id);
}

/** QC lulus: tambah unit lulus, dan barang jadi langsung masuk stok lewat fungsi Inventory. */
export async function passQc(tx: Tx, p: { lineId: string; qty: number; note?: string | null; userId?: string | null }) {
  const { line, project, done } = await loadLine(tx, p.lineId);
  ensureActive(project);
  if (!Number.isInteger(p.qty) || p.qty <= 0) throw new ProjectRuleError("Jumlah lulus harus bilangan bulat positif.");
  const room = done.FINISHING - done.QC;
  if (p.qty > room) throw new ProjectRuleError(`Hanya ${Math.max(room, 0)} unit yang selesai finishing dan menunggu QC.`);
  const qc = await tx.qcRecord.create({ data: { lineId: line.id, qty: p.qty, note: p.note?.trim() || null, userId: p.userId ?? null } });
  await receiveFinishedGoodsAtQc(tx, {
    productId: line.productId, qty: p.qty, qcId: qc.id, projectId: project.id, userId: p.userId,
    note: `QC lulus ${project.code}`,
  });
  await bump(tx, line.id, "QC", p.qty);
  await completeIfDone(tx, project.id);
  return qc;
}

export async function planDelivery(
  tx: Tx,
  p: { projectId: string; plannedDate?: Date | null; note?: string | null; lines: LineQty[]; userId?: string | null },
) {
  const project = await lockProject(tx, p.projectId);
  ensureActive(project);
  if (project.kind !== "ORDER") throw new ProjectRuleError("Produksi stok tidak dikirim ke pelanggan.");
  const lines = await tx.projectLine.findMany({ where: { projectId: p.projectId }, select: { id: true, qty: true } });
  const live = await tx.deliveryLine.findMany({
    where: { delivery: { projectId: p.projectId, status: { not: "BATAL" } } }, select: { lineId: true, qty: true },
  });
  const committed = new Map<string, number>();
  for (const d of live) committed.set(d.lineId, (committed.get(d.lineId) ?? 0) + d.qty);
  validateDeliveryPlan(lines, committed, p.lines);
  const seq = ((await tx.delivery.aggregate({ where: { projectId: p.projectId }, _max: { seq: true } }))._max.seq ?? 0) + 1;
  return tx.delivery.create({
    data: {
      projectId: p.projectId, seq, plannedDate: p.plannedDate ?? null, note: p.note?.trim() || null, userId: p.userId ?? null,
      lines: { create: p.lines.map((l) => ({ lineId: l.lineId, qty: l.qty })) },
    },
  });
}

export async function cancelDelivery(tx: Tx, deliveryId: string) {
  const d = await tx.delivery.findUnique({ where: { id: deliveryId } });
  if (!d) throw new NotFoundError("Pengiriman tidak ditemukan.");
  await lockProject(tx, d.projectId);
  const cur = await tx.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
  if (cur.status !== "RENCANA") throw new ProjectRuleError("Hanya rencana pengiriman yang bisa dibatalkan.");
  await tx.delivery.update({ where: { id: deliveryId }, data: { status: "BATAL" } });
}

/** Kirim barang: stok barang jadi berkurang lewat fungsi Inventory dan tahap Kirim bertambah. */
export async function shipDelivery(tx: Tx, p: { deliveryId: string; userId?: string | null }) {
  const found = await tx.delivery.findUnique({ where: { id: p.deliveryId } });
  if (!found) throw new NotFoundError("Pengiriman tidak ditemukan.");
  const project = await lockProject(tx, found.projectId);
  ensureActive(project);
  const d = await tx.delivery.findUniqueOrThrow({
    where: { id: p.deliveryId }, include: { lines: { include: { line: { select: { productId: true } } } } },
  });
  if (d.status !== "RENCANA") throw new ProjectRuleError("Pengiriman ini sudah dikirim atau dibatalkan.");

  const stages = await tx.projectStage.findMany({
    where: { line: { projectId: project.id }, stage: { in: ["PACKING", "KIRIM"] } },
  });
  const packed = new Map(stages.filter((s) => s.stage === "PACKING").map((s) => [s.lineId, s.done]));
  const shipped = new Map(stages.filter((s) => s.stage === "KIRIM").map((s) => [s.lineId, s.done]));
  validateShipment(d.lines.map((l) => ({ lineId: l.lineId, qty: l.qty })), packed, shipped);

  const byProduct = new Map<string, number>();
  for (const l of d.lines) byProduct.set(l.line.productId, (byProduct.get(l.line.productId) ?? 0) + l.qty);
  for (const [productId, qty] of byProduct) {
    await shipFinishedGoods(tx, { productId, qty, deliveryId: d.id, userId: p.userId, note: `Kirim ${project.code} #${d.seq}` });
  }
  for (const l of d.lines) await bump(tx, l.lineId, "KIRIM", l.qty);
  await tx.delivery.update({ where: { id: d.id }, data: { status: "TERKIRIM", shippedAt: new Date() } });
  await completeIfDone(tx, project.id);
}

export async function addCost(
  tx: Tx,
  p: { projectId: string; category: "BAHAN" | "TENAGA" | "LAIN"; description: string; amount: number; userId?: string | null },
) {
  const project = await lockProject(tx, p.projectId);
  if (project.status === "BATAL") throw new ProjectRuleError("Proyek dibatalkan.");
  if (!p.description.trim()) throw new ProjectRuleError("Keterangan biaya wajib diisi.");
  if (!Number.isFinite(p.amount) || p.amount <= 0) throw new ProjectRuleError("Jumlah biaya harus lebih dari nol.");
  return tx.projectCost.create({
    data: {
      projectId: p.projectId, category: p.category, description: p.description.trim(),
      amount: Math.round(p.amount * 100) / 100, userId: p.userId ?? null,
    },
  });
}

/** Hanya biaya manual yang bisa dihapus; biaya bahan dari stok mengikuti mutasi stok. */
export async function deleteCost(tx: Tx, costId: string) {
  const c = await tx.projectCost.findUnique({ where: { id: costId } });
  if (!c) throw new NotFoundError("Biaya tidak ditemukan.");
  if (c.source) throw new ProjectRuleError("Biaya bahan dari stok tidak bisa dihapus.");
  await tx.projectCost.delete({ where: { id: costId } });
  return c.projectId;
}

/** Batalkan proyek. Hanya bila belum ada bahan dikeluarkan, QC lulus, atau pengiriman. */
export async function cancelProject(tx: Tx, projectId: string) {
  const project = await lockProject(tx, projectId);
  ensureActive(project);
  const [issues, qcs, shipped] = await Promise.all([
    tx.materialIssue.count({ where: { line: { projectId } } }),
    tx.qcRecord.count({ where: { line: { projectId } } }),
    tx.delivery.count({ where: { projectId, status: "TERKIRIM" } }),
  ]);
  if (issues + qcs + shipped > 0) {
    throw new ProjectRuleError("Proyek sudah memakai bahan atau menghasilkan barang; selesaikan atau koreksi stok secara manual.");
  }
  await tx.project.update({ where: { id: projectId }, data: { status: "BATAL" } });
}

export { STAGES };
