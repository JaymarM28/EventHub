import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { InternalAuthGuard, RolesGuard } from '@event-hub/internal-auth';
import { PrismaModule } from './prisma/prisma.module';
import { MessagingModule } from './messaging/messaging.module';
import { EventsModule } from './events/events.module';
import { VenuesModule } from './venues/venues.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    MessagingModule,
    EventsModule,
    VenuesModule,
    StorageModule,
  ],
  providers: [
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
