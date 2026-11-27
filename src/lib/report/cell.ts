import { fmtDateLong, fmtNum, fmtRp } from "@/lib/format";
import type { Cell, ColType } from "./types";

const pctFmt = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const intFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** Teks sel untuk layar dan PDF. Rupiah negatif memakai tanda minus: -Rp 1.000. */
export function cellText(v: Cell | undefined, type: ColType = "text"): string {
  if (v === null || v === undefined || v === "") return type === "text" ? "" : "-";
  if (v instanceof Date) return fmtDateLong(v);
  if (typeof v === "string") return v;
  if (type === "rp") return v < 0 ? `-${fmtRp(-v)}` : fmtRp(v);
  if (type === "pct") return `${pctFmt.format(v)}%`;
  if (type === "int") return intFmt.format(v);
  return fmtNum(v);
}

export const isNumeric = (t: ColType | undefined) => t === "rp" || t === "int" || t === "pct";
