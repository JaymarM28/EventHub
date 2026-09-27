import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersClientService } from './users-client.service';
import { EmailService } from './email.service';
import { renderEmailHtml } from './email-template';

/**
 * Fase B: envío real vía Resend (antes era un console.log simulado). La
 * idempotencia sigue el mismo contrato que tickets-service (ProcessedEvent
 * dentro de la transacción), pero el ORDEN cambió respecto a la versión
 * simulada: ahora se envía el email PRIMERO y se marca procesado DESPUÉS.
 * Si se hiciera al revés (marcar y luego enviar), un fallo de Resend a
 * mitad de camino dejaría el evento como "procesado" sin haber enviado
 * nada — nunca se reintentaría. El costo de este orden es la contraparte:
 * si el envío tiene éxito pero el proceso muere antes de confirmar la
 * transacción, un reintento podría enviar el mismo email dos veces. Se
 * acepta ese trade-off (duplicado raro) sobre el otro (email perdido
 * silenciosamente) — mismo criterio que "at-least-once" del resto del
 * sistema (ver DESIGN.md premisa 7).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersClient: UsersClientService,
    private readonly emailService: EmailService,
  ) {}

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

    const recipient = await this.usersClient.findById(userId);
    await this.emailService.send(recipient.email, subject, renderEmailHtml(subject, body));

    await this.prisma.$transaction([
      this.prisma.notification.create({
        data: { userId, subject, body },
      }),
      this.prisma.processedEvent.create({
        data: { eventId, eventType },
      }),
    ]);
  }

  findByUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
