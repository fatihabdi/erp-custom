const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });
export const fmtQty = (n: number) => nf.format(n);
export const fmtSigned = (n: number) => (n > 0 ? `+${nf.format(n)}` : nf.format(n).replace("-", "−"));
const df = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
const dtf = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
export const fmtDate = (d: Date) => df.format(d);
export const fmtDateTime = (d: Date) => dtf.format(d);

const rp = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
export const fmtRp = (n: number) => `Rp ${rp.format(n)}`;
const dlf = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
export const fmtDateLong = (d: Date) => dlf.format(d);
/** Selisih hari dari hari ini (WIB); negatif bila sudah lewat. */
export function daysUntil(d: Date, now = new Date()): number {
  const day = (x: Date) => Math.floor((x.getTime() + 7 * 3600_000) / 86_400_000);
  return day(d) - day(now);
}
/** Nilai untuk <input type="date">. */
export const toDateInput = (d: Date | null | undefined) => (d ? new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10) : "");

const dfull = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
/** 26 November 2026 (dokumen resmi). */
export const fmtDateFull = (d: Date) => dfull.format(d);
const r0 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const r2f = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Angka rupiah tanpa awalan; sen hanya muncul bila ada. */
export const fmtNum = (n: number) => (Number.isInteger(n) ? r0.format(n) : r2f.format(n));
export const fmtRpFull = (n: number) => `Rp ${fmtNum(n)}`;
