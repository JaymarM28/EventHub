import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * "Envío" simulado (mismo criterio que el pago en orders-service): no hay
 * proveedor SMTP/push conectado — se loggea y se guarda en Postgres. La
 * idempotencia sigue el mismo contrato que tickets-service: se verifica
 * ProcessedEvent DENTRO de la misma transacción que crea la notificación,
 * así un mismo evento nunca genera dos notificaciones duplicadas.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notify(
    eventId: string,
    eventType: string,
    userId: string,
    subject: string,
    body: string,
  ): Promise<void> {
    const alreadyProcessed = await this.prisma.processedEvent.findUnique({
      where: { eventId },
    });
    if (alreadyProcessed) {
      this.logger.warn(`${eventType} ${eventId} ya procesado — ack sin reprocesar`);
      return;
    }

    await this.prisma.$transaction([
      this.prisma.notification.create({
        data: { userId, subject, body },
      }),
      this.prisma.processedEvent.create({
        data: { eventId, eventType },
      }),
    ]);

    // eslint-disable-next-line no-console
    console.log(`[EMAIL SIMULADO] Para usuario ${userId} — ${subject}\n${body}`);
  }

  findByUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
