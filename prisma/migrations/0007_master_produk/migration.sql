-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PRODUKSI', 'DAGANG');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('SEKOLAH', 'KANTOR', 'RUMAHAN', 'LAINNYA');

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "productId" TEXT;

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL DEFAULT 'LAINNYA',
    "type" "ProductType" NOT NULL DEFAULT 'PRODUKSI',
    "unit" TEXT NOT NULL,
    "size" TEXT,
    "material" TEXT,
    "spec" TEXT,
    "price" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "cost" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "productId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("productId")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE INDEX "products_active_category_idx" ON "products"("active", "category");

-- CreateIndex
CREATE UNIQUE INDEX "items_productId_key" ON "items"("productId");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Migrasi data: tiap barang jadi yang sudah ada menjadi satu produk di katalog.
-- Kode, nama, satuan, dan status aktif dipertahankan; stok dan BOM tetap menempel di barang yang sama,
-- jadi saldo dan riwayat mutasi tidak berubah. Harga jual awal diambil dari harga terakhir yang dipakai
-- di penawaran, atau di proyek pesanan bila belum pernah ditawarkan (0 bila belum pernah dijual).
-- Harga pokok diambil dari harga pokok barang. Kategori diisi "Lainnya" untuk dirapikan di Master Produk.
INSERT INTO "products" ("id", "code", "name", "category", "type", "unit", "price", "cost", "active", "createdAt", "updatedAt")
SELECT
  'prd_' || i."id", i."code", i."name", 'LAINNYA', 'PRODUKSI', i."unit",
  COALESCE(
    (SELECT ql."unitPrice" FROM "quotation_lines" ql JOIN "quotations" q ON q."id" = ql."quotationId"
       WHERE ql."productId" = i."id" ORDER BY q."date" DESC, ql."id" DESC LIMIT 1),
    (SELECT pl."unitPrice" FROM "project_lines" pl JOIN "projects" p ON p."id" = pl."projectId"
       WHERE pl."productId" = i."id" AND p."kind" = 'ORDER' AND pl."unitPrice" > 0 ORDER BY p."orderDate" DESC, pl."id" DESC LIMIT 1),
    0
  ),
  i."unitCost", i."active", i."createdAt", CURRENT_TIMESTAMP
FROM "items" i
WHERE i."kind" = 'FINISHED';

UPDATE "items" SET "productId" = 'prd_' || "id" WHERE "kind" = 'FINISHED';
