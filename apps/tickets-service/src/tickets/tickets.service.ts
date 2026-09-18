import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { signTicketToken } from '@event-hub/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { DomainEventsPublisher } from '../messaging/domain-events.publisher';

export interface OrderPaidPayload {
  orderId: string;
  userId: string;
  zoneId: string;
  reservationId: string;
  quantity: number;
}

class ZoneSoldOutError extends Error {}

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);
  private readonly qrSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly publisher: DomainEventsPublisher,
    config: ConfigService,
  ) {
    this.qrSecret = config.getOrThrow<string>('TICKET_QR_SECRET');
  }

  /**
   * Idempotencia explícita (premisa 7): a diferencia del sync de zonas
   * (upsert naturalmente idempotente), procesar el mismo order.paid dos
   * veces emitiría dos boletos por un solo pago — inaceptable. Se
   * verifica/inserta en ProcessedEvent DENTRO de la misma transacción que
   * crea el ticket, así que un fallo a mitad de camino nunca deja al
   * evento "medio procesado".
   *
   * Garantía dura contra sobreventa: `SELECT ... FOR UPDATE` bloquea la
   * fila de la zona durante la transacción — dos confirmaciones
   * concurrentes para la última unidad se serializan aquí, sin importar
   * qué haya pasado en el "soft hold" de Redis (reservations.service.ts).
   */
  async confirmFromOrder(eventId: string, payload: OrderPaidPayload): Promise<void> {
    const alreadyProcessed = await this.prisma.processedEvent.findUnique({
      where: { eventId },
    });
    if (alreadyProcessed) {
      this.logger.warn(`order.paid ${eventId} ya procesado — ack sin reprocesar`);
      return;
    }

    // Fase A (varios boletos por orden): cada orden emite `quantity`
    // boletos, cada uno con su propio id/QR — comparten orderId, así que
    // ya se pueden agrupar como "los boletos de esta compra" sin cambiar
    // el modelo de Ticket.
    const tickets = Array.from({ length: payload.quantity }, () => {
      const ticketId = randomUUID();
      return { ticketId, qrToken: signTicketToken(ticketId, this.qrSecret) };
    });

    await this.prisma.$transaction(async (tx) => {
      const zoneRows = await tx.$queryRaw<{ id: string; capacity: number }[]>`
        SELECT id, capacity FROM event_zones WHERE id = ${payload.zoneId} FOR UPDATE
      `;
      const zone = zoneRows[0];
      if (!zone) {
        throw new Error(`Zona ${payload.zoneId} no encontrada — no se puede emitir el boleto`);
      }

      const confirmedCount = await tx.ticket.count({ where: { zoneId: payload.zoneId } });
      if (confirmedCount + payload.quantity > zone.capacity) {
        // No debería pasar nunca si el soft hold de Redis funcionó bien —
        // se trata como caso crítico: se cobró y no hay cupo para los
        // `quantity` boletos completos. Requiere intervención manual
        // (reembolso parcial, fuera de alcance de este paso — ver
        // TODOS.md). Se lanza para que el mensaje vaya a la DLQ.
        throw new ZoneSoldOutError(
          `Zona ${payload.zoneId} sobrevendida al confirmar orden ${payload.orderId} (pidió ${payload.quantity}, quedaban ${zone.capacity - confirmedCount}) — requiere revisión manual`,
        );
      }

      for (const { ticketId, qrToken } of tickets) {
        await tx.ticket.create({
          data: {
            id: ticketId,
            zoneId: payload.zoneId,
            userId: payload.userId,
            orderId: payload.orderId,
            reservationId: payload.reservationId,
            qrToken,
          },
        });
      }

      await tx.processedEvent.create({
        data: { eventId, eventType: 'order.paid' },
      });
    });

    // Best-effort — el soft hold ya cumplió su propósito (evitar
    // sobreventa obvia durante el checkout); si esto falla, el hold
    // simplemente expira solo por TTL.
    await this.redis.release(payload.zoneId, payload.reservationId).catch((err) => {
      this.logger.warn(`No se pudo liberar el soft hold ${payload.reservationId}: ${err.message}`);
    });

    // Un evento por boleto (no uno con un array) — así ningún consumidor
    // existente (dashboard en vivo de api-gateway, notifications-service)
    // necesita cambiar para saber "cuántos boletos hay en este mensaje".
    for (const { ticketId } of tickets) {
      await this.publisher.publish('ticket.issued', {
        ticketId,
        orderId: payload.orderId,
        userId: payload.userId,
        zoneId: payload.zoneId,
      });
    }
  }

  findByUser(userId: string) {
    return this.prisma.ticket.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  /** Boletos vendidos por zona — alimenta el dashboard del organizador
   * (admin panel). Zonas sin ningún boleto no aparecen en el resultado;
   * el llamador (events-service) las completa con 0. */
  async soldCountByZone(zoneIds: string[]): Promise<{ zoneId: string; sold: number }[]> {
    if (zoneIds.length === 0) return [];
    const grouped = await this.prisma.ticket.groupBy({
      by: ['zoneId'],
      where: { zoneId: { in: zoneIds } },
      _count: { _all: true },
    });
    return grouped.map((g) => ({ zoneId: g.zoneId, sold: g._count._all }));
  }

  /**
   * Lectura SIN efectos secundarios — a diferencia de `validateScan`, que
   * marca el boleto como usado en el mismo paso en que lo consulta.
   * access-service necesita saber a qué evento pertenece el boleto ANTES
   * de decidir si quien escanea tiene permiso (TODOS.md #4) — si
   * resolviéramos el evento solo dentro de `validateScan`, un escaneador
   * NO autorizado ya habría "quemado" el boleto antes de que se le negara
   * el acceso.
   */
  async peek(ticketId: string): Promise<{ id: string; zoneId: string; eventId: string; userId: string; scannedAt: Date | null }> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      throw new NotFoundException(`Boleto ${ticketId} no existe`);
    }
    const zone = await this.prisma.eventZone.findUnique({ where: { id: ticket.zoneId } });
    if (!zone) {
      // No debería pasar — la zona se sincroniza desde events-service al
      // crear el evento (ZonesConsumer), antes de que puedan existir
      // boletos para ella.
      throw new NotFoundException(`Zona ${ticket.zoneId} del boleto ${ticketId} no encontrada`);
    }
    return {
      id: ticket.id,
      zoneId: ticket.zoneId,
      eventId: zone.eventId,
      userId: ticket.userId,
      scannedAt: ticket.scannedAt,
    };
  }

  /**
   * Validación de acceso (paso 7, access-service): marca el boleto como
   * usado de forma ATÓMICA — el `updateMany` con `scannedAt: null` en el
   * where hace que solo UNA de dos peticiones concurrentes (dos molinetes
   * escaneando el mismo QR al mismo tiempo) pueda ganar. La otra ve
   * `count: 0` y sabe que llegó tarde, sin necesitar un lock explícito.
   */
  async validateScan(ticketId: string): Promise<
    | { valid: true; ticket: { id: string; zoneId: string; userId: string } }
    | { valid: false; reason: string; scannedAt: Date }
  > {
    const result = await this.prisma.ticket.updateMany({
      where: { id: ticketId, scannedAt: null },
      data: { scannedAt: new Date() },
    });

    if (result.count === 1) {
      const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
      return {
        valid: true,
        ticket: { id: ticket.id, zoneId: ticket.zoneId, userId: ticket.userId },
      };
    }

    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      throw new NotFoundException(`Boleto ${ticketId} no existe`);
    }
    return {
      valid: false,
      reason: 'Este boleto ya fue usado',
      scannedAt: ticket.scannedAt!,
    };
  }
}
