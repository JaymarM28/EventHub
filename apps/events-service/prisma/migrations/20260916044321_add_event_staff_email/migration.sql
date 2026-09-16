-- AlterTable
-- Nullable primero + backfill (dato de prueba local, sin usuarios reales
-- todavía) — igual patrón que la migración de auth-service para
-- firstName/lastName/birthDate.
ALTER TABLE "event_staff" ADD COLUMN     "email" TEXT;

UPDATE "event_staff" SET "email" = COALESCE("email", 'sin-email@migracion.local');

ALTER TABLE "event_staff" ALTER COLUMN "email" SET NOT NULL;
