import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const gtf = await db.company.upsert({
    where: { code: "GTF" },
    update: {},
    create: { code: "GTF", name: "Garindotama Furniture", ppnRate: 0 },
  });
  const sba = await db.company.upsert({
    where: { code: "SBA" },
    update: {},
    create: { code: "SBA", name: "CV Singgasana Benderang Abadi", ppnRate: 11 },
  });

  const email = (process.env.ADMIN_EMAIL ?? "direktur@example.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.log("ADMIN_PASSWORD kosong: akun Direktur awal tidak dibuat.");
    return;
  }
  const exists = await db.user.findUnique({ where: { email } });
  if (exists) return;
  await db.user.create({
    data: {
      email,
      name: process.env.ADMIN_NAME ?? "Direktur",
      role: "DIREKTUR",
      passwordHash: await bcrypt.hash(password, 12),
      companies: { create: [{ companyId: gtf.id }, { companyId: sba.id }] },
    },
  });
  console.log(`Akun Direktur dibuat: ${email}`);
}

main().finally(() => db.$disconnect());
