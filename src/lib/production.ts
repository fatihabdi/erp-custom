// Aturan produksi dan biaya proyek yang murni (tanpa database), supaya mudah diuji.

export const STAGES = ["RANGKA_BESI", "POTONG_KAYU", "RAKIT", "FINISHING", "QC", "PACKING", "KIRIM"] as const;
export type StageName = (typeof STAGES)[number];

export const STAGE_LABEL: Record<StageName, string> = {
  RANGKA_BESI: "Rangka Besi",
  POTONG_KAYU: "Potong Kayu",
  RAKIT: "Rakit",
  FINISHING: "Finishing",
  QC: "QC",
  PACKING: "Packing",
  KIRIM: "Kirim",
};

/** Pesanan memakai ketujuh tahap; produksi stok berhenti di QC (barang jadi masuk stok di sana). */
export function stagesFor(kind: "ORDER" | "STOK"): readonly StageName[] {
  return kind === "ORDER" ? STAGES : STAGES.slice(0, 5);
}

/** Tahap yang progresnya diisi manual; QC dan Kirim berasal dari catatan QC dan pengiriman. */
export const MANUAL_STAGES = ["RANGKA_BESI", "POTONG_KAYU", "RAKIT", "FINISHING", "PACKING"] as const;
export type ManualStage = (typeof MANUAL_STAGES)[number];

export class ProjectRuleError extends Error {}

export type StageDone = Record<StageName, number>;
export const emptyStageDone = (): StageDone => ({
  RANGKA_BESI: 0, POTONG_KAYU: 0, RAKIT: 0, FINISHING: 0, QC: 0, PACKING: 0, KIRIM: 0,
});

export type StageStatus = "BELUM" | "BERJALAN" | "SELESAI" | "TERTAHAN";
export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  BELUM: "Belum mulai", BERJALAN: "Dikerjakan", SELESAI: "Selesai", TERTAHAN: "Tertahan",
};

export function stageStatus(done: number, total: number, held = false): StageStatus {
  if (held && done < total) return "TERTAHAN";
  if (total > 0 && done >= total) return "SELESAI";
  if (done > 0) return "BERJALAN";
  return "BELUM";
}

/** Tahap hulu yang membatasi sebuah tahap (unit tidak bisa lebih maju dari tahap sebelumnya). */
const UPSTREAM: Record<StageName, StageName[]> = {
  RANGKA_BESI: [],
  POTONG_KAYU: [],
  RAKIT: ["RANGKA_BESI", "POTONG_KAYU"],
  FINISHING: ["RAKIT"],
  QC: ["FINISHING"],
  PACKING: ["QC"],
  KIRIM: ["PACKING"],
};
/** Tahap hilir yang sudah mengambil unit dari sebuah tahap. */
const DOWNSTREAM: Record<StageName, StageName[]> = {
  RANGKA_BESI: ["RAKIT"],
  POTONG_KAYU: ["RAKIT"],
  RAKIT: ["FINISHING"],
  FINISHING: ["QC"],
  QC: ["PACKING"],
  PACKING: ["KIRIM"],
  KIRIM: [],
};

/**
 * Rentang jumlah selesai yang sah untuk sebuah tahap: tidak boleh melebihi tahap hulu
 * (rangka besi dan potong kayu dibatasi bahan yang sudah dikeluarkan) dan tidak boleh
 * di bawah yang sudah diambil tahap hilir.
 */
export function stageBounds(stage: StageName, done: StageDone, qty: number, issuedUnits: number) {
  const up = UPSTREAM[stage];
  const max = up.length === 0 ? Math.min(qty, issuedUnits) : Math.min(qty, ...up.map((s) => done[s]));
  const min = Math.max(0, ...DOWNSTREAM[stage].map((s) => done[s]));
  return { min, max };
}

export function validateStageDone(stage: ManualStage, next: number, done: StageDone, qty: number, issuedUnits: number) {
  if (!Number.isInteger(next) || next < 0) throw new ProjectRuleError("Jumlah harus bilangan bulat, minimal 0.");
  const { min, max } = stageBounds(stage, done, qty, issuedUnits);
  if (next > max) {
    const why = stage === "RANGKA_BESI" || stage === "POTONG_KAYU"
      ? `bahan baru dikeluarkan untuk ${issuedUnits} unit (keluarkan bahan lebih dulu)`
      : `tahap sebelumnya baru selesai ${max} unit`;
    throw new ProjectRuleError(`${STAGE_LABEL[stage]} tidak bisa ${next} dari ${qty}: ${why}.`);
  }
  if (next < min) {
    throw new ProjectRuleError(`${STAGE_LABEL[stage]} tidak bisa di bawah ${min}: tahap berikutnya sudah memproses ${min} unit.`);
  }
}

export type ProgressLine = { qty: number; done: StageDone };

/** Jumlah selesai per tahap, dijumlahkan seluruh baris. */
export function aggregateStages(lines: ProgressLine[]): { total: number; done: StageDone } {
  const done = emptyStageDone();
  let total = 0;
  for (const l of lines) {
    total += l.qty;
    for (const s of STAGES) done[s] += l.done[s];
  }
  return { total, done };
}

/** Progres keseluruhan 0-100: rata-rata penyelesaian semua tahap, berbobot unit. */
export function overallPercent(lines: ProgressLine[], stages: readonly StageName[]): number {
  const { total, done } = aggregateStages(lines);
  if (total === 0 || stages.length === 0) return 0;
  const sum = stages.reduce((n, s) => n + Math.min(done[s], total), 0);
  return Math.round((sum / (total * stages.length)) * 100);
}

/** Tahap yang sedang berjalan: tahap terjauh yang sebagian selesai; bila tidak ada, tahap pertama yang belum selesai. */
export function currentStage(lines: ProgressLine[], stages: readonly StageName[]): StageName | null {
  const { total, done } = aggregateStages(lines);
  if (total === 0) return null;
  for (let i = stages.length - 1; i >= 0; i--) {
    const d = done[stages[i]];
    if (d > 0 && d < total) return stages[i];
  }
  return stages.find((s) => done[s] < total) ?? null;
}

export function isProjectComplete(lines: ProgressLine[], stages: readonly StageName[]): boolean {
  const { total, done } = aggregateStages(lines);
  return total > 0 && stages.every((s) => done[s] >= total);
}

// ---------------------------------------------------------------------------
// Nilai, PPN, biaya, dan margin
// ---------------------------------------------------------------------------

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Nilai pesanan. Harga satuan tanpa PPN; PPN mengikuti tarif perusahaan (GTF 0, SBA 11). */
export function orderTotals(lines: { qty: number; unitPrice: number }[], ppnRate: number) {
  const subtotal = r2(lines.reduce((n, l) => n + l.qty * l.unitPrice, 0));
  const ppn = r2((subtotal * ppnRate) / 100);
  return { subtotal, ppn, total: r2(subtotal + ppn) };
}

/** Margin dihitung dari nilai tanpa PPN dikurangi seluruh biaya. */
export function projectMargin(valueExPpn: number, costs: { category: "BAHAN" | "TENAGA" | "LAIN"; amount: number }[]) {
  const by = { BAHAN: 0, TENAGA: 0, LAIN: 0 };
  for (const c of costs) by[c.category] += c.amount;
  const totalCost = r2(by.BAHAN + by.TENAGA + by.LAIN);
  const margin = r2(valueExPpn - totalCost);
  const percent = valueExPpn > 0 ? Math.round((margin / valueExPpn) * 1000) / 10 : null;
  return { bahan: r2(by.BAHAN), tenaga: r2(by.TENAGA), lain: r2(by.LAIN), totalCost, margin, percent };
}

// ---------------------------------------------------------------------------
// Pengiriman bertahap
// ---------------------------------------------------------------------------

export type LineQty = { lineId: string; qty: number };

/** Rencana pengiriman: jumlah yang sudah dijadwalkan atau terkirim tidak boleh melebihi pesanan. */
export function validateDeliveryPlan(
  lines: { id: string; qty: number }[],
  committed: Map<string, number>,
  requested: LineQty[],
) {
  if (requested.length === 0) throw new ProjectRuleError("Pilih minimal satu barang untuk dikirim.");
  for (const r of requested) {
    if (!Number.isInteger(r.qty) || r.qty <= 0) throw new ProjectRuleError("Jumlah kirim harus bilangan bulat positif.");
    const line = lines.find((l) => l.id === r.lineId);
    if (!line) throw new ProjectRuleError("Barang tidak ada di proyek ini.");
    const left = line.qty - (committed.get(r.lineId) ?? 0);
    if (r.qty > left) throw new ProjectRuleError(`Jumlah kirim melebihi sisa pesanan (${left} unit).`);
  }
}

/** Saat mengirim: jumlah terkirim tidak boleh melebihi yang sudah dipacking. */
export function validateShipment(requested: LineQty[], packed: Map<string, number>, shipped: Map<string, number>) {
  for (const r of requested) {
    const ready = (packed.get(r.lineId) ?? 0) - (shipped.get(r.lineId) ?? 0);
    if (r.qty > ready) {
      throw new ProjectRuleError(`Baru ${Math.max(ready, 0)} unit yang sudah dipacking dan siap kirim (diminta ${r.qty}).`);
    }
  }
}

export function projectCode(kind: "ORDER" | "STOK", year: number, seq: number): string {
  return `${kind === "ORDER" ? "PRY" : "STK"}-${year}-${String(seq).padStart(3, "0")}`;
}

/** Hak akses membuat: pesanan lewat modul Order (Marketing, Admin, Direktur); produksi stok lewat Proyek. */
export function createModuleFor(kind: "ORDER" | "STOK"): "order" | "proyek" {
  return kind === "ORDER" ? "order" : "proyek";
}
