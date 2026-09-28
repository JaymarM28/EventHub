-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'REFUNDED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "wompiRefundId" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3);
