import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EVENT_TYPES } from '@event-hub/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventsPublisher } from '../messaging/domain-events.publisher';

/**
 * Notificaciones push (2026-09-29) — recordatorio "tu evento es pronto".
 * events-service es el único que sabe CUÁNDO (startsAt); a QUIÉN avisar lo
 * resuelve notifications-service consumiendo este evento y preguntándole a
 * orders-service quién compró en estas zonas (mismo criterio de
 * responsabilidad que el resto del proyecto: cada servicio publica sobre
 * SU propio dominio, nunca sabe quién más consume ni por qué).
 *
 * Ventana de 23-25h en vez de "exactamente 24h": el cron corre cada hora
 * (@Cron no garantiza el minuto exacto), así que una ventana de 2h asegura
 * que cada evento caiga en AL MENOS una pasada sin depender de que el cron
 * arranque en un momento preciso. `reminderSentAt` evita que un evento se
 * notifique dos veces si cae en dos pasadas dentro de la ventana.
 */
@Injectable()
export class EventRemindersService {
  private readonly logger = new Logger(EventRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: DomainEventsPublisher,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sendDueReminders(): Promise<void> {
    const now = Date.now();
    const windowStart = new Date(now + 23 * 60 * 60 * 1000);
    const windowEnd = new Date(now + 25 * 60 * 60 * 1000);

    const events = await this.prisma.event.findMany({
      where: {
        startsAt: { gte: windowStart, lte: windowEnd },
        cancelledAt: null,
        reminderSentAt: null,
      },
      include: { zones: true },
    });

    for (const event of events) {
      try {
        await this.publisher.publish(EVENT_TYPES.EVENT_REMINDER_DUE, {
          id: event.id,
          title: event.title,
          venue: event.venue,
          city: event.city,
          startsAt: event.startsAt,
          currency: event.currency,
          zoneIds: event.zones.map((z) => z.id),
        });
        await this.prisma.event.update({
          where: { id: event.id },
          data: { reminderSentAt: new Date() },
        });
      } catch (err) {
        // Un evento que falla no debe frenar el recordatorio de los demás
        // — queda con reminderSentAt null, así que la PRÓXIMA pasada del
        // cron (dentro de la misma ventana de 2h) lo reintenta solo.
        this.logger.error(
          `No se pudo publicar el recordatorio del evento ${event.id}: ${(err as Error).message}`,
        );
      }
    }
  }
}
