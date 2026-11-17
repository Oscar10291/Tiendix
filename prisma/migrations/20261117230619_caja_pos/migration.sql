-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "change" DECIMAL(12,2),
ADD COLUMN     "tendered" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "cashSessionId" TEXT;

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openingAmount" DECIMAL(12,2) NOT NULL,
    "openingNote" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "salesCount" INTEGER,
    "cashSales" DECIMAL(12,2),
    "expectedCash" DECIMAL(12,2),
    "countedCash" DECIMAL(12,2),
    "difference" DECIMAL(12,2),
    "denominations" JSONB,
    "closingNote" TEXT,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_sessions_number_key" ON "cash_sessions"("number");

-- CreateIndex
CREATE INDEX "cash_sessions_branchId_openedAt_idx" ON "cash_sessions"("branchId", "openedAt");

-- CreateIndex
CREATE INDEX "cash_sessions_userId_status_idx" ON "cash_sessions"("userId", "status");

-- CreateIndex
CREATE INDEX "payments_saleId_idx" ON "payments"("saleId");

-- CreateIndex
CREATE INDEX "sales_cashSessionId_idx" ON "sales"("cashSessionId");

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Un usuario solo puede tener una caja abierta a la vez (índice único parcial)
CREATE UNIQUE INDEX "cash_sessions_one_open_per_user" ON "cash_sessions"("userId") WHERE "status" = 'OPEN';
