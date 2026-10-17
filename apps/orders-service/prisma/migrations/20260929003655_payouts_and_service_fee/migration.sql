-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'SETTLED');

-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('SAVINGS', 'CHECKING');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "payoutId" TEXT,
ADD COLUMN     "serviceFeeAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "organizer_payout_accounts" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "accountType" "BankAccountType" NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "legalIdType" TEXT NOT NULL,
    "legalId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizer_payout_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "ordersCount" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'SETTLED',
    "externalReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizer_payout_accounts_organizerId_key" ON "organizer_payout_accounts"("organizerId");

-- CreateIndex
CREATE INDEX "payouts_organizerId_idx" ON "payouts"("organizerId");

-- CreateIndex
CREATE INDEX "orders_payoutId_idx" ON "orders"("payoutId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
