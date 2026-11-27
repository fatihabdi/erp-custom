-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('MESIN', 'KENDARAAN', 'PERALATAN');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('AKTIF', 'PERAWATAN', 'RUSAK', 'DIJUAL', 'DIHAPUSKAN');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('RUTIN', 'SERVIS', 'PERBAIKAN');

-- CreateTable
CREATE TABLE "asset_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "usefulLifeMonths" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "serialNumber" TEXT,
    "location" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'AKTIF',
    "acquiredAt" DATE NOT NULL,
    "acquisitionCost" DECIMAL(16,2) NOT NULL,
    "salvageValue" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL DEFAULT 0,
    "disposedAt" DATE,
    "disposalValue" DECIMAL(16,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_maintenance" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "MaintenanceType" NOT NULL,
    "performedAt" DATE NOT NULL,
    "cost" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "vendor" TEXT,
    "description" TEXT NOT NULL,
    "nextDueAt" DATE,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_assignments" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "assignee" TEXT NOT NULL,
    "assignedAt" DATE NOT NULL,
    "returnedAt" DATE,
    "note" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "asset_categories_name_key" ON "asset_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "assets_code_key" ON "assets"("code");

-- CreateIndex
CREATE INDEX "assets_companyId_status_idx" ON "assets"("companyId", "status");

-- CreateIndex
CREATE INDEX "assets_categoryId_idx" ON "assets"("categoryId");

-- CreateIndex
CREATE INDEX "asset_maintenance_assetId_performedAt_idx" ON "asset_maintenance"("assetId", "performedAt");

-- CreateIndex
CREATE INDEX "asset_maintenance_nextDueAt_idx" ON "asset_maintenance"("nextDueAt");

-- CreateIndex
CREATE INDEX "asset_assignments_assetId_assignedAt_idx" ON "asset_assignments"("assetId", "assignedAt");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_maintenance" ADD CONSTRAINT "asset_maintenance_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Aturan data aset dijaga juga di database.
ALTER TABLE "assets" ADD CONSTRAINT "assets_nilai_check" CHECK ("acquisitionCost" >= 0 AND "salvageValue" >= 0 AND "salvageValue" <= "acquisitionCost" AND "usefulLifeMonths" >= 0);
ALTER TABLE "asset_maintenance" ADD CONSTRAINT "asset_maintenance_cost_check" CHECK ("cost" >= 0);
