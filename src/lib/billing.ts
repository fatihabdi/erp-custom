// Aturan termin, tagihan, dan pembayaran yang murni (tanpa database), supaya mudah diuji.
// Semua uang dihitung dalam sen (bilangan bulat) agar pembagian termin tidak meninggalkan selisih.

export class DocumentRuleError extends Error {}

export const toCents = (n: number) => Math.round((n + Number.EPSILON) * 100);
export const fromCents = (c: number) => c / 100;

export type TermInput = { label: string; trigger: string; percent: number; dueDays: number };

/** Skema bawaan: DP 30% saat KO, pelunasan 70% saat barang dikirim. */
export const DEFAULT_TERMS: TermInput[] = [
  { label: "DP", trigger: "Saat Konfirmasi Order ditandatangani", percent: 30, dueDays: 7 },
  { label: "Pelunasan", trigger: "Saat barang dikirim", percent: 70, dueDays: 14 },
];

export const TERM_PRESETS: { name: string; terms: TermInput[] }[] = [
  { name: "DP 30% + pelunasan 70%", terms: DEFAULT_TERMS },
  {
    name: "4 termin × 25%",
    terms: [
      { label: "Termin 1", trigger: "Saat Konfirmasi Order ditandatangani", percent: 25, dueDays: 7 },
      { label: "Termin 2", trigger: "Saat produksi 50%", percent: 25, dueDays: 14 },
      { label: "Termin 3", trigger: "Saat barang dikirim", percent: 25, dueDays: 14 },
      { label: "Termin 4", trigger: "Saat serah terima", percent: 25, dueDays: 14 },
    ],
  },
  { name: "Lunas 100% (net 14 hari)", terms: [{ label: "Lunas", trigger: "Jatuh tempo 14 hari setelah invoice", percent: 100, dueDays: 14 }] },
];

export type TermRow = { label: string; trigger: string; percent: string; dueDays: string };

/** Baris isian formulir (teks) dari termin tersimpan. Dipakai server dan klien. */
export const toRows = (terms: TermInput[]): TermRow[] =>
  terms.map((t) => ({ label: t.label, trigger: t.trigger, percent: String(t.percent), dueDays: String(t.dueDays) }));

/** Termin harus ada, setiap persen > 0, dan jumlahnya tepat 100%. */
export function validateTerms(terms: TermInput[]): void {
  if (terms.length === 0) throw new DocumentRuleError("Tambahkan minimal satu termin pembayaran.");
  if (terms.length > 12) throw new DocumentRuleError("Termin pembayaran maksimal 12.");
  for (const t of terms) {
    if (!t.label.trim()) throw new DocumentRuleError("Nama termin wajib diisi.");
    if (!t.trigger.trim()) throw new DocumentRuleError(`Pemicu termin "${t.label}" wajib diisi.`);
    if (!Number.isFinite(t.percent) || t.percent <= 0 || t.percent > 100) throw new DocumentRuleError(`Persen termin "${t.label}" harus antara 0 dan 100.`);
    if (!Number.isInteger(t.dueDays) || t.dueDays < 0 || t.dueDays > 365) throw new DocumentRuleError(`Jatuh tempo termin "${t.label}" tidak valid (0-365 hari).`);
  }
  const sum = terms.reduce((n, t) => n + Math.round(t.percent * 100), 0);
  if (sum !== 10_000) throw new DocumentRuleError(`Total termin harus 100% (sekarang ${sum / 100}%).`);
}

/**
 * Bagi `totalCents` menurut persen. Setiap bagian dibulatkan; bagian terakhir menyerap selisih
 * sehingga jumlah semua bagian selalu sama dengan total.
 */
export function allocateByPercent(totalCents: number, percents: number[]): number[] {
  const out: number[] = [];
  let used = 0;
  percents.forEach((p, i) => {
    if (i === percents.length - 1) out.push(totalCents - used);
    else {
      const v = Math.round((totalCents * p) / 100);
      out.push(v);
      used += v;
    }
  });
  return out;
}

export type OrderAmounts = { subtotal: number; ppn: number; total: number };

/** Nilai pesanan dari baris dan tarif PPN (rupiah, PPN dibulatkan ke sen). */
export function orderAmounts(lines: { qty: number; unitPrice: number }[], ppnRate: number): OrderAmounts {
  const subC = lines.reduce((n, l) => n + l.qty * toCents(l.unitPrice), 0);
  const ppnC = Math.round((subC * ppnRate) / 100);
  return { subtotal: fromCents(subC), ppn: fromCents(ppnC), total: fromCents(subC + ppnC) };
}

export type TermAmount = { subtotal: number; ppn: number; total: number };

/** Jumlah tagihan tiap termin: DPP dan PPN dibagi sendiri-sendiri sehingga total semua invoice = total order. */
export function termAmounts(order: OrderAmounts, percents: number[]): TermAmount[] {
  const sub = allocateByPercent(toCents(order.subtotal), percents);
  const ppn = allocateByPercent(toCents(order.ppn), percents);
  return sub.map((s, i) => ({ subtotal: fromCents(s), ppn: fromCents(ppn[i]), total: fromCents(s + ppn[i]) }));
}

export type PayState = "BELUM" | "SEBAGIAN" | "LUNAS";

export function paymentState(total: number, paid: number): PayState {
  const t = toCents(total);
  const p = toCents(paid);
  if (p >= t && t > 0) return "LUNAS";
  return p > 0 ? "SEBAGIAN" : "BELUM";
}

export const sisaTagihan = (total: number, paid: number) => fromCents(Math.max(0, toCents(total) - toCents(paid)));

/** Hari kalender WIB (UTC+7) sebagai angka, untuk membandingkan tanggal tanpa jam. */
const wibDay = (d: Date) => Math.floor((d.getTime() + 7 * 3600_000) / 86_400_000);

/** Lewat jatuh tempo: belum lunas dan jatuh tempo sebelum hari ini (WIB). */
export function isOverdue(dueDate: Date, state: PayState, now = new Date()): boolean {
  return state !== "LUNAS" && wibDay(dueDate) < wibDay(now);
}

export const daysLate = (dueDate: Date, now = new Date()) => Math.max(0, wibDay(now) - wibDay(dueDate));

/** Jatuh tempo = tanggal invoice + hari. */
export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/** Pembayaran baru tidak boleh nol, negatif, atau melebihi sisa tagihan. */
export function validatePayment(total: number, alreadyPaid: number, amount: number): void {
  if (!Number.isFinite(amount) || toCents(amount) <= 0) throw new DocumentRuleError("Jumlah pembayaran harus lebih dari nol.");
  const left = sisaTagihan(total, alreadyPaid);
  if (toCents(amount) > toCents(left)) {
    throw new DocumentRuleError(`Jumlah pembayaran melebihi sisa tagihan (Rp ${left.toLocaleString("id-ID")}).`);
  }
}

export const METHOD_LABEL = { TRANSFER: "Transfer bank", TUNAI: "Tunai", CEK_GIRO: "Cek / giro", LAIN: "Lainnya" } as const;
export type MethodName = keyof typeof METHOD_LABEL;

/** Keterangan pembayaran di kwitansi, mis. "Sebagian DP 30%, invoice SBA-018/INV/XI/2026". */
export function paymentPurpose(p: { termLabel: string; percent: number; invoiceNumber: string; partial: boolean }): string {
  const pct = Number.isInteger(p.percent) ? `${p.percent}` : p.percent.toString().replace(".", ",");
  return `${p.partial ? "Sebagian " : ""}${p.termLabel} ${pct}%, invoice ${p.invoiceNumber}`;
}

/** Catatan dokumen: satu catatan per baris, baris kosong dibuang. */
export const noteLines = (s: string | null | undefined): string[] =>
  (s ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
