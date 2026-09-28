-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "seatIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
