-- AlterTable
ALTER TABLE "events" ADD COLUMN     "venueId" TEXT;

-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "mapImageUrl" TEXT;

-- AlterTable
ALTER TABLE "zones" ADD COLUMN     "venueSectionId" TEXT;

-- CreateTable
CREATE TABLE "venue_sections" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "points" JSONB NOT NULL,

    CONSTRAINT "venue_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "venue_sections_venueId_idx" ON "venue_sections"("venueId");

-- CreateIndex
CREATE INDEX "zones_venueSectionId_idx" ON "zones"("venueSectionId");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_venueSectionId_fkey" FOREIGN KEY ("venueSectionId") REFERENCES "venue_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_sections" ADD CONSTRAINT "venue_sections_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
