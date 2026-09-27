-- AlterTable: Stripe -> Mercado Pago (Stripe no opera en Colombia)
DROP INDEX IF EXISTS "orders_stripePaymentIntentId_key";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "stripePaymentIntentId";
ALTER TABLE "orders" ADD COLUMN "mercadoPagoPreferenceId" TEXT;
ALTER TABLE "orders" ADD COLUMN "mercadoPagoPaymentId" TEXT;

CREATE UNIQUE INDEX "orders_mercadoPagoPaymentId_key" ON "orders"("mercadoPagoPaymentId");
