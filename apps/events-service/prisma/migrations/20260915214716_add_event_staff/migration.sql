-- CreateTable
CREATE TABLE "event_staff" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_staff_eventId_idx" ON "event_staff"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "event_staff_eventId_userId_key" ON "event_staff"("eventId", "userId");

-- AddForeignKey
ALTER TABLE "event_staff" ADD CONSTRAINT "event_staff_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
