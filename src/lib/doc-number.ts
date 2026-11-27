import type { Prisma } from "@/generated/prisma/client";

export type DocTypeName = "SPH" | "KO" | "INV" | "KW";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export function romanMonth(month: number): string {
  if (month < 1 || month > 12) throw new RangeError("bulan harus 1-12");
  return ROMAN[month - 1];
}

const pad3 = (n: number) => String(n).padStart(3, "0");

/** Tanggal, bulan, dan tahun menurut kalender WIB, supaya nomor tidak bergeser di server berzona UTC. */
export function wibParts(date: Date): { day: number; month: number; year: number } {
  const d = new Date(date.getTime() + 7 * 3600_000);
  return { day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
}

/**
 * Nomor dasar (tanpa akhiran bentrok).
 * - SPH berawalan tanggal terbit: GTF.018/SPH/XI/2026
 * - Lainnya berurutan per tahun:  GTF-024/INV/X/2026
 */
export function formatDocNumber(opts: {
  companyCode: string;
  docType: DocTypeName;
  date: Date;
  sequence?: number;
}): string {
  const { companyCode, docType, date, sequence } = opts;
  const { day, month, year } = wibParts(date);
  const roman = romanMonth(month);
  if (docType === "SPH") {
    return `${companyCode}.${pad3(day)}/SPH/${roman}/${year}`;
  }
  if (!sequence) throw new Error("sequence wajib untuk jenis dokumen berurutan");
  return `${companyCode}-${pad3(sequence)}/${docType}/${roman}/${year}`;
}

/** Tambahkan akhiran -2, -3, ... bila nomor sudah dipakai. */
export function withCollisionSuffix(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Terbitkan nomor dokumen di dalam transaksi. Aman untuk permintaan bersamaan:
 * penghitung dikunci dengan upsert, dan nomor SPH dijaga oleh unique constraint
 * (percobaan ulang bila bentrok).
 */
export async function issueDocNumber(
  tx: Prisma.TransactionClient,
  opts: { companyId: string; companyCode: string; docType: DocTypeName; date?: Date },
): Promise<string> {
  const date = opts.date ?? new Date();
  const { companyId, companyCode, docType } = opts;

  if (docType === "SPH") {
    const base = formatDocNumber({ companyCode, docType, date });
    const existing = await tx.documentNumber.findMany({
      where: { companyId, docType, number: { startsWith: base } },
      select: { number: true },
    });
    const number = withCollisionSuffix(base, new Set(existing.map((e) => e.number)));
    await tx.documentNumber.create({ data: { companyId, docType, number } });
    return number;
  }

  const year = wibParts(date).year;
  const seq = await tx.documentSequence.upsert({
    where: { companyId_docType_year: { companyId, docType, year } },
    create: { companyId, docType, year, last: 1 },
    update: { last: { increment: 1 } },
  });
  const number = formatDocNumber({ companyCode, docType, date, sequence: seq.last });
  await tx.documentNumber.create({ data: { companyId, docType, number } });
  return number;
}
