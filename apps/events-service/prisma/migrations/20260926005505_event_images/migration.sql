-- AlterTable
ALTER TABLE "events" ADD COLUMN     "coverImageUrl" TEXT,
ADD COLUMN     "galleryImageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
