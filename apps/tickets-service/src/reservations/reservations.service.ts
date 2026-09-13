import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * "Soft hold" (premisa 6 de DESIGN.md): esta reserva vive en Redis con TTL
 * y protege contra la mayoría de los casos de sobreventa de forma rápida
 * (sin escribir en Postgres). NO es la garantía dura — `maxAvailable` se
 * calcula leyendo Postgres justo antes de llamar al script de Redis, así
 * que hay una ventana de carrera teórica entre esa lectura y la
 * confirmación real. La garantía dura vive en tickets.service.ts
 * (confirmFromOrder), con un lock de fila (`FOR UPDATE`) sobre la zona
 * dentro de la transacción de Postgres al procesar order.paid — ahí es
 * imposible sobrevender sin importar lo que haya pasado en Redis.
 */
@Injectable()
export class ReservationsService {
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    // ConfigService.get<T>() no convierte tipos en runtime — un valor de
    // .env siempre llega como string, hay que parsearlo explícitamente.
    const ttlMinutes = Number(config.get('RESERVATION_TTL_MINUTES', '10'));
    this.ttlMs = ttlMinutes * 60_000;
  }

  async reserve(zoneId: string, userId: string) {
    const zone = await this.prisma.eventZone.findUnique({ where: { id: zoneId } });
    if (!zone) {
      throw new NotFoundException(`Zona ${zoneId} no encontrada`);
    }

    const confirmedCount = await this.prisma.ticket.count({ where: { zoneId } });
    const maxAvailable = zone.capacity - confirmedCount;

    if (maxAvailable <= 0) {
      throw new ConflictException('Zona agotada');
    }

    const hold = await this.redis.tryReserve(zoneId, userId, maxAvailable, this.ttlMs);
    if (!hold) {
      throw new ConflictException('Zona agotada (reservas activas en curso)');
    }

    // Incluir el precio evita que orders-service tenga que llamar a
    // events-service por separado solo para calcular el monto a cobrar —
    // tickets-service ya tiene su propia copia sincronizada (ZonesConsumer).
    return { ...hold, zoneId, price: Number(zone.price) };
  }

  async release(reservationId: string): Promise<void> {
    const hold = await this.redis.getReservation(reservationId);
    if (hold) {
      await this.redis.release(hold.zoneId, reservationId);
    }
  }
}
