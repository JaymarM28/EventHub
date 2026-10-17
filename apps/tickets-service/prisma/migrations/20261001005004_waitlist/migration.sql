-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "waitlist_entries_zoneId_notifiedAt_idx" ON "waitlist_entries"("zoneId", "notifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_zoneId_userId_key" ON "waitlist_entries"("zoneId", "userId");
