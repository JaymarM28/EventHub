import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { InternalAuthGuard, RolesGuard } from '@event-hub/internal-auth';
import { PrismaModule } from './prisma/prisma.module';
import { MessagingModule } from './messaging/messaging.module';
import { OutboxModule } from './outbox/outbox.module';
import { OrdersModule } from './orders/orders.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    MessagingModule,
    OutboxModule,
    OrdersModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) =>
        new InternalAuthGuard(process.env.INTERNAL_AUTH_SECRET!, reflector),
      inject: [Reflector],
    },
    // Hallazgo de seguridad (2026-09-28, verificado en vivo): faltaba este
    // guard — sin él, TODO `@Roles(...)` de este servicio (for-zones,
    // refund, y los nuevos endpoints de payouts) no restringía nada, un
    // usuario autenticado de CUALQUIER rol pasaba. Debe ir DESPUÉS de
    // InternalAuthGuard (depende de `request.internalUser` ya poblado) —
    // mismo orden que events-service, el único servicio que ya lo tenía bien.
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
