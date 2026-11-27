import { db } from "@/lib/db";
import type { BuildCtx } from "./build";
import { parsePeriod, resolveScope } from "./filters";

export type ReportQuery = { dari?: string; sampai?: string; pt?: string };

/** Perusahaan yang boleh dilaporkan pengguna, periode, dan perusahaan terpilih dari parameter URL. */
export async function reportContext(user: { role: string; companies: { id: string; code: string }[] }, q: ReportQuery, now = new Date()): Promise<BuildCtx> {
  const accessible = user.companies.length > 0
    ? user.companies.map((c) => ({ id: c.id, code: c.code }))
    : await db.company.findMany({ where: { active: true }, select: { id: true, code: true } });
  return { scope: resolveScope(user.role, accessible, q.pt), period: parsePeriod(q.dari, q.sampai, now), now };
}
