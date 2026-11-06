import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { InternalAuthGuard, RolesGuard } from '@event-hub/internal-auth';
import { PrismaModule } from './prisma/prisma.module';
import { MessagingModule } from './messaging/messaging.module';
import { EventsModule } from './events/events.module';
import { VenuesModule } from './venues/venues.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    // SentryModule.forRoot() va PRIMERO (ver docs de @sentry/nestjs).
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    MessagingModule,
    EventsModule,
    VenuesModule,
    StorageModule,
  ],
  providers: [
    // Monitoreo de errores (TODOS.md #16) — DEBE ser el primer APP_FILTER.
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) =>
        new InternalAuthGuard(
          process.env.INTERNAL_AUTH_SECRET!,
          reflector,
        ),
      inject: [Reflector],
    },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
