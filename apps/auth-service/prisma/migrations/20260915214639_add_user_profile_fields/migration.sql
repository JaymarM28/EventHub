-- AlterTable
-- Se agregan como nullable, se rellenan las filas existentes (todas datos
-- de prueba de desarrollo local, sin usuarios reales todavía) con un
-- placeholder, y RECIÉN entonces se marcan NOT NULL — un ADD COLUMN NOT
-- NULL directo sobre una tabla con filas falla (ver migración original
-- generada por `prisma migrate dev --create-only`).
ALTER TABLE "users" ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT;

UPDATE "users" SET
  "firstName" = COALESCE("firstName", 'Sin nombre'),
  "lastName" = COALESCE("lastName", 'Sin apellido'),
  "birthDate" = COALESCE("birthDate", '2000-01-01T00:00:00.000Z');

ALTER TABLE "users" ALTER COLUMN "birthDate" SET NOT NULL,
ALTER COLUMN "firstName" SET NOT NULL,
ALTER COLUMN "lastName" SET NOT NULL;
