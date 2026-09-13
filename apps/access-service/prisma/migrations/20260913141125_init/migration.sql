-- CreateEnum
CREATE TYPE "ScanResult" AS ENUM ('VALID', 'ALREADY_USED', 'INVALID', 'DEGRADED');

-- CreateTable
CREATE TABLE "scan_logs" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT,
    "result" "ScanResult" NOT NULL,
    "reason" TEXT,
    "scannedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scan_logs_ticketId_idx" ON "scan_logs"("ticketId");
