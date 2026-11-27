-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'KETUA_KAYU';
ALTER TYPE "Role" ADD VALUE 'KETUA_BESI';

-- CreateTable
CREATE TABLE "production_orders" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_order_lines" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "projectLineId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "spec" TEXT,

    CONSTRAINT "production_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_order_images" (
    "lineId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_order_images_pkey" PRIMARY KEY ("lineId")
);

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_projectId_key" ON "production_orders"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_orderId_key" ON "production_orders"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_companyId_number_key" ON "production_orders"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "production_order_lines_projectLineId_key" ON "production_order_lines"("projectLineId");

-- CreateIndex
CREATE INDEX "production_order_lines_orderId_idx" ON "production_order_lines"("orderId");

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_lines" ADD CONSTRAINT "production_order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_lines" ADD CONSTRAINT "production_order_lines_projectLineId_fkey" FOREIGN KEY ("projectLineId") REFERENCES "project_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_images" ADD CONSTRAINT "production_order_images_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "production_order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Isi Sales Order untuk Konfirmasi Order yang sudah ada sebelum fitur ini.
INSERT INTO "production_orders" ("id", "companyId", "projectId", "orderId", "number", "updatedAt")
SELECT gen_random_uuid()::text, so."companyId", so."projectId", so."id", replace(so."number", '/KO/', '/SO/'), CURRENT_TIMESTAMP
FROM "sales_orders" so;

INSERT INTO "production_order_lines" ("id", "orderId", "projectLineId", "sort", "title")
SELECT gen_random_uuid()::text, po."id", pl."id", pl."sort", i."name"
FROM "production_orders" po
JOIN "project_lines" pl ON pl."projectId" = po."projectId"
JOIN "items" i ON i."id" = pl."productId";
