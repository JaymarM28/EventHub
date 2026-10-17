import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersClientService } from './users-client.service';
import { EmailService } from './email.service';
import { PushService } from './push.service';
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
    private readonly pushService: PushService,
  ) {}

  /**
   * `pushBody` es texto plano (a diferencia de `body`, que es HTML para el
   * email) — separado en vez de derivarlo con un strip-HTML frágil, así
   * cada notificación controla exactamente qué muestra el push. Default al
   * subject si no se pasa nada (algunas notificaciones no necesitan un
   * segundo texto).
   */
  async notify(
    eventId: string,
    eventType: string,
    userId: string,
    subject: string,
    body: string,
    pushBody?: string,
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

    // Best-effort a propósito (a diferencia del email de arriba): un token
    // de push vencido es normal y NO debe frenar la idempotencia ni dejar
    // de mandar el email — ver PushService.sendToUser.
    await this.pushService.sendToUser(userId, subject, pushBody ?? subject).catch((err) => {
      this.logger.warn(`Push a ${userId} falló (no bloquea el email): ${(err as Error).message}`);
    });

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
