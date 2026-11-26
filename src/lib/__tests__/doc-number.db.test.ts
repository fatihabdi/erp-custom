import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { issueDocNumber } from "../doc-number";

// Tes integrasi: hanya berjalan bila DATABASE_URL tersedia (CI memakai service Postgres).
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("issueDocNumber (database)", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  let companyId = "";

  beforeAll(async () => {
    const c = await db.company.create({ data: { code: `T${Date.now() % 100000}`, name: "Tes" } });
    companyId = c.id;
  });
  afterAll(async () => {
    await db.company.delete({ where: { id: companyId } });
    await db.$disconnect();
  });

  it("SPH di hari yang sama mendapat akhiran -2", async () => {
    const date = new Date(2026, 10, 18);
    const run = () => db.$transaction((tx) => issueDocNumber(tx, { companyId, companyCode: "TST", docType: "SPH", date }));
    expect(await run()).toBe("TST.018/SPH/XI/2026");
    expect(await run()).toBe("TST.018/SPH/XI/2026-2");
  });

  it("invoice berurutan per tahun", async () => {
    const date = new Date(2026, 9, 3);
    const run = () => db.$transaction((tx) => issueDocNumber(tx, { companyId, companyCode: "TST", docType: "INV", date }));
    expect(await run()).toBe("TST-001/INV/X/2026");
    expect(await run()).toBe("TST-002/INV/X/2026");
  });
});
