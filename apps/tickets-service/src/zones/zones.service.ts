import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface EventCreatedPayload {
  id: string;
  currency: string;
  zones: {
    id: string;
    name: string;
    price: string | number;
    capacity: number;
    /// Solo viene poblado en el evento.updated que dispara
    /// EventsService.generateSeats — el resto de los flujos de
    /// event.created/updated no lo incluyen (ver comentario ahí sobre por
    /// qué no se sobre-pide en cada fetch de evento). Ausente/undefined
    /// ⇒ esta zona no tocó su catálogo de butacas, no hay nada que
    /// sincronizar.
    seats?: { id: string; rowLabel: string; seatNumber: number }[];
  }[];
}

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert por zona — naturalmente idempotente (el mismo evento procesado
   * dos veces produce el mismo estado final), así que este consumidor NO
   * necesita la tabla ProcessedEvent. Contrasta con el consumidor de
   * order.paid (tickets.service.ts), donde procesar el mismo evento dos
   * veces emitiría DOS boletos — ahí sí hace falta el dedup explícito.
   */
  async syncFromEvent(payload: EventCreatedPayload): Promise<void> {
    await Promise.all(
      payload.zones.map(async (zone) => {
        await this.prisma.eventZone.upsert({
          where: { id: zone.id },
          create: {
            id: zone.id,
            eventId: payload.id,
            name: zone.name,
            price: zone.price,
            currency: payload.currency,
            capacity: zone.capacity,
          },
          update: {
            name: zone.name,
            price: zone.price,
            currency: payload.currency,
            capacity: zone.capacity,
            syncedAt: new Date(),
          },
        });

        if (zone.seats !== undefined) {
          await this.syncSeats(zone.id, zone.seats);
        }
      }),
    );
  }

  /**
   * Butacas generadas una sola vez del lado de events-service (sin
   * `delete`/regenerar, ver comentario en su schema.prisma) — `createMany`
   * con `skipDuplicates` alcanza para idempotencia (el mismo event.updated
   * reentregado dos veces no duplica filas), no hace falta un upsert por
   * butaca como con las zonas (que sí pueden editarse repetidamente).
   */
  private async syncSeats(zoneId: string, seats: { id: string; rowLabel: string; seatNumber: number }[]) {
    await this.prisma.seat.createMany({
      data: seats.map((s) => ({ id: s.id, zoneId, rowLabel: s.rowLabel, seatNumber: s.seatNumber })),
      skipDuplicates: true,
    });
  }
}
