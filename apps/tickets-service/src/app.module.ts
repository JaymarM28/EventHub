import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { InternalAuthGuard, RolesGuard } from '@event-hub/internal-auth';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { MessagingModule } from './messaging/messaging.module';
import { ZonesModule } from './zones/zones.module';
import { ReservationsModule } from './reservations/reservations.module';
import { TicketsModule } from './tickets/tickets.module';
import { WaitlistModule } from './waitlist/waitlist.module';

@Module({
  imports: [
    // SentryModule.forRoot() va PRIMERO (ver docs de @sentry/nestjs).
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    MessagingModule,
    ZonesModule,
    ReservationsModule,
    TicketsModule,
    WaitlistModule,
  ],
  providers: [
    // Monitoreo de errores (TODOS.md #16) — DEBE ser el primer APP_FILTER.
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) =>
        new InternalAuthGuard(process.env.INTERNAL_AUTH_SECRET!, reflector),
      inject: [Reflector],
    },
    // Hallazgo de seguridad (2026-09-28, verificado en vivo en
    // orders-service — ver el comentario equivalente ahí): faltaba este
    // guard, sin el cual `@Roles(...)` no restringe nada. Debe ir DESPUÉS
    // de InternalAuthGuard (depende de `request.internalUser` poblado).
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
