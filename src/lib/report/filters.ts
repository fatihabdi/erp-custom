// Aturan filter dan pengelompokan laporan yang murni (tanpa database), supaya mudah diuji.
import { toCents } from "@/lib/billing";
import { wibParts } from "@/lib/doc-number";
import { toDateInput } from "@/lib/format";

const DAY = 86_400_000;
const WIB = 7 * 3600_000;

export type Period = { from: Date; toExclusive: Date; fromStr: string; toStr: string };

function parseDay(s: string | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return t;
}

/** Periode (hari WIB, ujung-ujungnya termasuk). Bawaan: 1 Januari tahun ini sampai hari ini. Tanggal terbalik ditukar. */
export function parsePeriod(dari: string | undefined, sampai: string | undefined, now = new Date()): Period {
  const today = parseDay(toDateInput(now))!;
  let a = parseDay(dari) ?? new Date(Date.UTC(wibParts(now).year, 0, 1));
  let b = parseDay(sampai) ?? today;
  if (a > b) [a, b] = [b, a];
  return {
    from: new Date(a.getTime() - WIB),
    toExclusive: new Date(b.getTime() + DAY - WIB),
    fromStr: a.toISOString().slice(0, 10),
    toStr: b.toISOString().slice(0, 10),
  };
}

export type ScopeResult<T> = { selected: T[]; combined: boolean; value: string; options: { value: string; label: string }[] };

/**
 * Perusahaan yang dilaporkan. Gabungan (semua perusahaan) hanya untuk Direktur; peran lain selalu satu perusahaan
 * dan terbatas pada perusahaan yang boleh diaksesnya.
 */
export function resolveScope<T extends { code: string }>(role: string, accessible: T[], requested?: string): ScopeResult<T> {
  const list = [...accessible].sort((a, b) => a.code.localeCompare(b.code));
  const canCombine = role === "DIREKTUR" && list.length > 1;
  const options = [...(canCombine ? [{ value: "", label: "Gabungan" }] : []), ...list.map((c) => ({ value: c.code, label: c.code }))];
  const one = list.find((c) => c.code === requested);
  if (one) return { selected: [one], combined: false, value: one.code, options };
  if (canCombine) return { selected: list, combined: true, value: "", options };
  return { selected: list.slice(0, 1), combined: false, value: list[0]?.code ?? "", options };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** Kunci bulan WIB yang urut: 2026-11. */
export function monthKey(d: Date): string {
  const { year, month } = wibParts(d);
  return `${year}-${String(month).padStart(2, "0")}`;
}
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export const AGING_LABELS = ["0-30 hari", "31-60 hari", "61-90 hari", "Lebih dari 90 hari"] as const;
/** Umur piutang (hari sejak tanggal invoice) ke kelompok 0..3. */
export function agingBucket(ageDays: number): 0 | 1 | 2 | 3 {
  if (ageDays <= 30) return 0;
  if (ageDays <= 60) return 1;
  if (ageDays <= 90) return 2;
  return 3;
}

export type TermKind = "DP" | "TERMIN" | "PELUNASAN";
export const TERM_KIND_LABEL: Record<TermKind, string> = { DP: "DP", TERMIN: "Termin", PELUNASAN: "Pelunasan" };
/** Nama termin bebas diketik, jadi jenisnya ditebak dari kata kuncinya. */
export function termKind(label: string): TermKind {
  const s = label.toLowerCase();
  if (/\bdp\b|uang muka/.test(s)) return "DP";
  if (/pelunasan|lunas/.test(s)) return "PELUNASAN";
  return "TERMIN";
}

/** Jumlah uang dalam rupiah, dijumlah per sen supaya tidak ada selisih desimal. */
export const sumMoney = (xs: number[]) => xs.reduce((n, x) => n + toCents(x), 0) / 100;

/**
 * Bagi DPP sebuah invoice ke kategori produk menurut nilai baris pesanan. Selisih pembulatan masuk ke bagian terbesar,
 * jadi jumlah semua bagian selalu sama dengan DPP. Tanpa baris bernilai, seluruhnya masuk `fallback`.
 */
export function allocateToCategories(subtotal: number, lines: { category: string; value: number }[], fallback: string): Map<string, number> {
  const total = lines.reduce((n, l) => n + toCents(l.value), 0);
  const out = new Map<string, number>();
  const subC = toCents(subtotal);
  if (total <= 0) {
    out.set(fallback, subtotal);
    return out;
  }
  const cents = new Map<string, number>();
  for (const l of lines) cents.set(l.category, (cents.get(l.category) ?? 0) + toCents(l.value));
  let used = 0;
  let biggest = "";
  const shares = new Map<string, number>();
  for (const [cat, c] of cents) {
    const share = Math.round((subC * c) / total);
    shares.set(cat, share);
    used += share;
    if (!biggest || c > (cents.get(biggest) ?? 0)) biggest = cat;
  }
  shares.set(biggest, (shares.get(biggest) ?? 0) + (subC - used));
  for (const [cat, c] of shares) out.set(cat, c / 100);
  return out;
}

/** Pilihan cepat periode di atas formulir filter. */
export function periodPresets(now = new Date()): { label: string; dari: string; sampai: string }[] {
  const { year, month } = wibParts(now);
  const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
  const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  return [
    { label: "Bulan ini", dari: iso(year, month, 1), sampai: toDateInput(now) },
    { label: "Bulan lalu", dari: iso(prev.y, prev.m, 1), sampai: iso(prev.y, prev.m, lastDay(prev.y, prev.m)) },
    { label: "Tahun ini", dari: iso(year, 1, 1), sampai: toDateInput(now) },
    { label: "Tahun lalu", dari: iso(year - 1, 1, 1), sampai: iso(year - 1, 12, 31) },
  ];
}
