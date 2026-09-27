-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('MUSICA', 'DEPORTES', 'TEATRO', 'CONFERENCIA', 'FESTIVAL', 'OTRO');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "category" "EventCategory",
ADD COLUMN     "city" TEXT;

-- CreateIndex
CREATE INDEX "events_city_idx" ON "events"("city");

-- CreateIndex
CREATE INDEX "events_category_idx" ON "events"("category");
