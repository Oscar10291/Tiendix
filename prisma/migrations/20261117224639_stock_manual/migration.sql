-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'MANUAL_IN';
ALTER TYPE "StockMovementType" ADD VALUE 'MANUAL_OUT';

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "balance" DECIMAL(12,3),
ADD COLUMN     "reason" TEXT;
