-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('DIREKTUR', 'ADMIN', 'MARKETING', 'GUDANG', 'KEUANGAN');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('SPH', 'KO', 'INV', 'KW');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "ppnRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "bankName" TEXT,
    "bankAccount" TEXT,
    "bankHolder" TEXT,
    "signatoryName" TEXT,
    "signatoryTitle" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_companies" (
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "user_companies_pkey" PRIMARY KEY ("userId","companyId")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "companyId" TEXT NOT NULL,
    "docType" "DocType" NOT NULL,
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("companyId","docType","year")
);

-- CreateTable
CREATE TABLE "document_numbers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "docType" "DocType" NOT NULL,
    "number" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_code_key" ON "companies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "document_numbers_companyId_docType_number_key" ON "document_numbers"("companyId", "docType", "number");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_numbers" ADD CONSTRAINT "document_numbers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

