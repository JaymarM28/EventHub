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
CREATE UNIQUE INDEX "seats_zoneId_rowLabel_seatNumber_key" ON "seats"("zoneId", "rowLabel", "seatNumber");

-- AddForeignKey
ALTER TABLE "seats" ADD CONSTRAINT "seats_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
