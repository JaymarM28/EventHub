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

  async reserve(zoneId: string, userId: string, quantity: number) {
    const zone = await this.prisma.eventZone.findUnique({ where: { id: zoneId } });
    if (!zone) {
      throw new NotFoundException(`Zona ${zoneId} no encontrada`);
    }

    // #22/#11 — un boleto reembolsado NO debe seguir ocupando cupo (bug
    // real encontrado al construir la lista de espera: sin este filtro,
    // una zona reembolsada quedaba "agotada" para siempre, aunque el cupo
    // ya estaba libre de verdad).
    const confirmedCount = await this.prisma.ticket.count({ where: { zoneId, refundedAt: null } });
    const maxAvailable = zone.capacity - confirmedCount;

    if (maxAvailable < quantity) {
      throw new ConflictException('Zona agotada');
    }

    const hold = await this.redis.tryReserve(zoneId, userId, quantity, maxAvailable, this.ttlMs);
    if (!hold) {
      throw new ConflictException('Zona agotada (reservas activas en curso)');
    }

    // Precio UNITARIO — orders-service multiplica por la cantidad. Incluir
    // esto evita que orders-service tenga que llamar a events-service por
    // separado solo para calcular el monto a cobrar — tickets-service ya
    // tiene su propia copia sincronizada (ZonesConsumer). `currency` viaja
    // igual (Fase D, #20) — orders-service la necesita para crear el
    // PaymentIntent de Stripe en la moneda correcta.
    return { ...hold, zoneId, quantity, price: Number(zone.price), currency: zone.currency };
  }

  /**
   * Fase 2 (asiento individual): variante de `reserve()` para zonas con
   * butacas generadas — en vez de pedir una cantidad contra un cupo
   * numérico, el comprador ya eligió butacas puntuales. La validación de
   * "existen y no están vendidas" vive acá (Postgres); el hold en sí
   * (todo-o-nada, TTL) vive en RedisService.trySeatReserve.
   */
  async reserveSeats(zoneId: string, userId: string, seatIds: string[]) {
    const zone = await this.prisma.eventZone.findUnique({ where: { id: zoneId } });
    if (!zone) {
      throw new NotFoundException(`Zona ${zoneId} no encontrada`);
    }

    const seats = await this.prisma.seat.findMany({ where: { id: { in: seatIds }, zoneId } });
    if (seats.length !== seatIds.length) {
      throw new NotFoundException('Una o más butacas no existen en esta zona');
    }

    const sold = await this.prisma.ticket.findMany({ where: { seatId: { in: seatIds } }, select: { seatId: true } });
    if (sold.length > 0) {
      throw new ConflictException('Una o más butacas ya fueron vendidas');
    }

    const hold = await this.redis.trySeatReserve(seatIds, zoneId, userId, this.ttlMs);
    if (!hold) {
      throw new ConflictException('Una o más butacas están siendo reservadas por otro comprador en este momento');
    }

    return {
      ...hold,
      zoneId,
      seatIds,
      quantity: seatIds.length,
      price: Number(zone.price),
      currency: zone.currency,
    };
  }

  async release(reservationId: string): Promise<void> {
    const hold = await this.redis.getReservation(reservationId);
    if (hold) {
      await this.redis.release(hold.zoneId, reservationId);
      return;
    }
    const seatHold = await this.redis.getSeatReservation(reservationId);
    if (seatHold) {
      await this.redis.releaseSeats(reservationId, seatHold.seatIds);
    }
  }
}
