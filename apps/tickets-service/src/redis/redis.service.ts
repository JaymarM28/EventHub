import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { RESERVE_SCRIPT } from './reserve.lua';

interface RedisWithCommands extends Redis {
  tryReserve(
    zoneKey: string,
    reservationKey: string,
    now: number,
    ttlMs: number,
    reservationId: string,
    maxAvailable: number,
    zoneId: string,
    userId: string,
    quantity: number,
  ): Promise<number>;
}

export interface ReservationHold {
  zoneId: string;
  userId: string;
  expiresAt: number;
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: RedisWithCommands;

  constructor(config: ConfigService) {
    this.client = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      // ConfigService.get<T>() no convierte tipos en runtime — un valor de
      // .env siempre llega como string, hay que parsearlo explícitamente.
      port: Number(config.get('REDIS_PORT', '6379')),
    }) as RedisWithCommands;

    this.client.defineCommand('tryReserve', {
      numberOfKeys: 2,
      lua: RESERVE_SCRIPT,
    });
  }

  /**
   * "Soft hold" con TTL — ver la nota completa sobre la garantía dura
   * (Postgres FOR UPDATE en confirm) en reservations.service.ts.
   */
  async tryReserve(
    zoneId: string,
    userId: string,
    quantity: number,
    maxAvailable: number,
    ttlMs: number,
  ): Promise<{ reservationId: string; expiresAt: number } | null> {
    const reservationId = randomUUID();
    const now = Date.now();
    const expiresAt = now + ttlMs;

    const result = await this.client.tryReserve(
      `zone:${zoneId}:reservations`,
      `reservation:${reservationId}`,
      now,
      ttlMs,
      reservationId,
      maxAvailable,
      zoneId,
      userId,
      quantity,
    );

    return result === 1 ? { reservationId, expiresAt } : null;
  }

  async getReservation(reservationId: string): Promise<ReservationHold | null> {
    const data = await this.client.hgetall(`reservation:${reservationId}`);
    if (!data.zoneId) {
      return null;
    }
    return {
      zoneId: data.zoneId,
      userId: data.userId,
      expiresAt: Number(data.expiresAt),
    };
  }

  async release(zoneId: string, reservationId: string): Promise<void> {
    await Promise.all([
      this.client.zrem(`zone:${zoneId}:reservations`, reservationId),
      this.client.del(`reservation:${reservationId}`),
    ]);
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
