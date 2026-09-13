import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface EventCreatedPayload {
  id: string;
  zones: { id: string; name: string; price: string | number; capacity: number }[];
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
      payload.zones.map((zone) =>
        this.prisma.eventZone.upsert({
          where: { id: zone.id },
          create: {
            id: zone.id,
            eventId: payload.id,
            name: zone.name,
            price: zone.price,
            capacity: zone.capacity,
          },
          update: {
            name: zone.name,
            price: zone.price,
            capacity: zone.capacity,
            syncedAt: new Date(),
          },
        }),
      ),
    );
  }
}
