-- AlterTable
ALTER TABLE "orders" ADD COLUMN "wompiTransactionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_wompiTransactionId_key" ON "orders"("wompiTransactionId");
