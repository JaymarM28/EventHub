import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { RESERVE_SCRIPT } from './reserve.lua';
import { RESERVE_SEATS_SCRIPT } from './reserve-seats.lua';

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

export interface SeatReservationHold {
  zoneId: string;
  userId: string;
  expiresAt: number;
  seatIds: string[];
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

  /**
   * A diferencia de `tryReserve` (número fijo de 2 keys, registrado una
   * vez con `defineCommand`), acá el número de keys varía con la cantidad
   * de butacas del lote — se usa `EVAL` directo en vez de un comando
   * nombrado, que exige una aridad fija de antemano.
   */
  async trySeatReserve(
    seatIds: string[],
    zoneId: string,
    userId: string,
    ttlMs: number,
  ): Promise<{ reservationId: string; expiresAt: number } | null> {
    const reservationId = randomUUID();
    const expiresAt = Date.now() + ttlMs;
    const keys = seatIds.map((id) => `seat-hold:${id}`);

    const result = await this.client.eval(
      RESERVE_SEATS_SCRIPT,
      keys.length,
      ...keys,
      ttlMs,
      reservationId,
      zoneId,
      userId,
      expiresAt,
      ...seatIds,
    );

    return result === 1 ? { reservationId, expiresAt } : null;
  }

  async getSeatReservation(reservationId: string): Promise<SeatReservationHold | null> {
    const data = await this.client.hgetall(`seat-reservation:${reservationId}`);
    if (!data.zoneId) {
      return null;
    }
    return {
      zoneId: data.zoneId,
      userId: data.userId,
      expiresAt: Number(data.expiresAt),
      seatIds: data.seatIds ? data.seatIds.split(',') : [],
    };
  }

  /** Idempotente a propósito — un release tardío (después de que el TTL ya
   * expiró las claves solo) no rompe nada, simplemente no borra nada. */
  async releaseSeats(reservationId: string, seatIds: string[]): Promise<void> {
    const keys = seatIds.map((id) => `seat-hold:${id}`);
    await Promise.all([
      keys.length > 0 ? this.client.del(...keys) : Promise.resolve(),
      this.client.del(`seat-reservation:${reservationId}`),
    ]);
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
