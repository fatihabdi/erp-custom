-- CreateEnum
CREATE TYPE "Stage" AS ENUM ('RANGKA_BESI', 'POTONG_KAYU', 'RAKIT', 'FINISHING', 'QC', 'PACKING', 'KIRIM');

-- CreateEnum
CREATE TYPE "ProjectKind" AS ENUM ('ORDER', 'STOK');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('BERJALAN', 'SELESAI', 'BATAL');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('RENCANA', 'TERKIRIM', 'BATAL');

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('BAHAN', 'TENAGA', 'LAIN');

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "unitCost" DECIMAL(16,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "taxId" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "ProjectKind" NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'BERJALAN',
    "name" TEXT NOT NULL,
    "companyId" TEXT,
    "customerId" TEXT,
    "orderRef" TEXT,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "ppnRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_lines" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPrice" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "issuedUnits" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "project_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_stages" (
    "lineId" TEXT NOT NULL,
    "stage" "Stage" NOT NULL,
    "done" INTEGER NOT NULL DEFAULT 0,
    "held" BOOLEAN NOT NULL DEFAULT false,
    "holdNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_stages_pkey" PRIMARY KEY ("lineId","stage")
);

-- CreateTable
CREATE TABLE "material_issues" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "cost" DECIMAL(16,2) NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_records" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "note" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qc_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "plannedDate" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "status" "DeliveryStatus" NOT NULL DEFAULT 'RENCANA',
    "note" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_lines" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "delivery_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_costs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" "CostCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "source" TEXT,
    "refId" TEXT,
    "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE INDEX "projects_status_dueDate_idx" ON "projects"("status", "dueDate");

-- CreateIndex
CREATE INDEX "projects_kind_status_idx" ON "projects"("kind", "status");

-- CreateIndex
CREATE INDEX "project_lines_projectId_idx" ON "project_lines"("projectId");

-- CreateIndex
CREATE INDEX "material_issues_lineId_idx" ON "material_issues"("lineId");

-- CreateIndex
CREATE INDEX "qc_records_lineId_idx" ON "qc_records"("lineId");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_projectId_seq_key" ON "deliveries"("projectId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_lines_deliveryId_lineId_key" ON "delivery_lines"("deliveryId", "lineId");

-- CreateIndex
CREATE UNIQUE INDEX "project_costs_refId_key" ON "project_costs"("refId");

-- CreateIndex
CREATE INDEX "project_costs_projectId_idx" ON "project_costs"("projectId");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_lines" ADD CONSTRAINT "project_lines_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_lines" ADD CONSTRAINT "project_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "project_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_issues" ADD CONSTRAINT "material_issues_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "project_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_records" ADD CONSTRAINT "qc_records_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "project_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_lines" ADD CONSTRAINT "delivery_lines_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_lines" ADD CONSTRAINT "delivery_lines_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "project_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_costs" ADD CONSTRAINT "project_costs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Aturan data dasar.
ALTER TABLE "project_lines" ADD CONSTRAINT "project_lines_qty_pos" CHECK ("qty" > 0);
ALTER TABLE "project_lines" ADD CONSTRAINT "project_lines_issued_range" CHECK ("issuedUnits" >= 0 AND "issuedUnits" <= "qty");
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_done_nonneg" CHECK ("done" >= 0);
ALTER TABLE "delivery_lines" ADD CONSTRAINT "delivery_lines_qty_pos" CHECK ("qty" > 0);
ALTER TABLE "items" ADD CONSTRAINT "items_unit_cost_nonneg" CHECK ("unitCost" >= 0);
