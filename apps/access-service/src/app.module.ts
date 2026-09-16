import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { InternalAuthGuard } from '@event-hub/internal-auth';
import { PrismaModule } from './prisma/prisma.module';
import { ScansModule } from './scans/scans.module';
import { EventAccessModule } from './event-access/event-access.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, ScansModule, EventAccessModule],
  providers: [
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) =>
        new InternalAuthGuard(process.env.INTERNAL_AUTH_SECRET!, reflector),
      inject: [Reflector],
    },
  ],
})
export class AppModule {}
