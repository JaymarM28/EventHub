import * as Sentry from '@sentry/nestjs';

/** Monitoreo de errores en producción (TODOS.md #16) — DEBE ser el PRIMER
 * import de main.ts (antes de @nestjs/core y cualquier otro módulo): la
 * auto-instrumentación de Sentry parchea módulos de Node (http, amqplib,
 * etc.) al cargarse, y si algo los importa primero el parche llega tarde.
 * Sin SENTRY_DSN (desarrollo local), Sentry.init queda como no-op — no
 * hace falta ningún guard manual. */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  tracesSampleRate: 0.1,
  initialScope: { tags: { service: 'orders-service' } },
});
