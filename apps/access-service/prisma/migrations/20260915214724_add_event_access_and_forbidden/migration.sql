-- AlterEnum
ALTER TYPE "ScanResult" ADD VALUE 'FORBIDDEN';

-- CreateTable
CREATE TABLE "event_access" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_access_eventId_idx" ON "event_access"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "event_access_eventId_userId_key" ON "event_access"("eventId", "userId");
