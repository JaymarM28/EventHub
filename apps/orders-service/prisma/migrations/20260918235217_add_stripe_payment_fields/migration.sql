-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'COP',
ADD COLUMN     "stripePaymentIntentId" TEXT;

-- CreateIndex
-- Nullable, así que múltiples filas existentes en NULL conviven sin problema
-- (Postgres no las considera duplicadas para un UNIQUE index).
CREATE UNIQUE INDEX "orders_stripePaymentIntentId_key" ON "orders"("stripePaymentIntentId");
