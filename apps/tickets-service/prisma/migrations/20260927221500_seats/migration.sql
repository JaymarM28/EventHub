-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "seatId" TEXT;

-- CreateTable
CREATE TABLE "seats" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "rowLabel" TEXT NOT NULL,
    "seatNumber" INTEGER NOT NULL,

    CONSTRAINT "seats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seats_zoneId_idx" ON "seats"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_seatId_key" ON "tickets"("seatId");
