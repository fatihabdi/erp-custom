-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "supplier" TEXT,
ADD COLUMN     "unitCost" DECIMAL(16,2);

-- Mutasi lama: tanggal kejadian = waktu pencatatan.
UPDATE "stock_movements" SET "occurredAt" = "createdAt";

-- CreateIndex
CREATE INDEX "stock_movements_occurredAt_idx" ON "stock_movements"("occurredAt");
