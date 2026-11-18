-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "expectedAt" TIMESTAMP(3),
ADD COLUMN     "orderedAt" TIMESTAMP(3),
ADD COLUMN     "receivedById" TEXT;

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "notes" TEXT;

-- CreateIndex
CREATE INDEX "purchase_items_purchaseId_idx" ON "purchase_items"("purchaseId");

-- CreateIndex
CREATE INDEX "purchase_items_productId_idx" ON "purchase_items"("productId");

-- CreateIndex
CREATE INDEX "purchases_supplierId_createdAt_idx" ON "purchases"("supplierId", "createdAt");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
