import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  // SentryModule.forRoot() va PRIMERO (ver docs de @sentry/nestjs).
  imports: [SentryModule.forRoot(), ConfigModule.forRoot({ isGlobal: true }), DashboardModule],
  providers: [
    // Monitoreo de errores (TODOS.md #16) — DEBE ser el primer APP_FILTER.
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
  ],
})
export class AppModule {}
