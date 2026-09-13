import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { EVENT_TYPES, EventEnvelope } from '@event-hub/shared-types';
import { NotificationsService } from './notifications.service';

interface OrderPaidPayload {
  orderId: string;
  userId: string;
  zoneId: string;
}

interface TicketIssuedPayload {
  ticketId: string;
  orderId: string;
  userId: string;
  zoneId: string;
}

/**
 * Primer caso real de 3+ servicios colaborando por pub/sub (DESIGN.md,
 * paso 6): orders-service publica order.paid, tickets-service lo consume
 * Y publica ticket.issued, y este servicio consume AMBOS — cada compra
 * exitosa dispara dos notificaciones independientes (pago confirmado,
 * boleto listo), cada una con su propia idempotencia.
 */
@Controller()
export class NotificationsConsumer {
  private readonly logger = new Logger(NotificationsConsumer.name);

  constructor(private readonly notifications: NotificationsService) {}

  @EventPattern(EVENT_TYPES.ORDER_PAID)
  async handleOrderPaid(
    @Payload() envelope: EventEnvelope<OrderPaidPayload>,
    @Ctx() context: RmqContext,
  ) {
    await this.handle(context, envelope, async () => {
      await this.notifications.notify(
        envelope.eventId,
        envelope.type,
        envelope.payload.userId,
        'Confirmamos tu pago',
        `Tu orden ${envelope.payload.orderId} fue pagada con éxito. Tu boleto está en camino.`,
      );
    });
  }

  @EventPattern(EVENT_TYPES.TICKET_ISSUED)
  async handleTicketIssued(
    @Payload() envelope: EventEnvelope<TicketIssuedPayload>,
    @Ctx() context: RmqContext,
  ) {
    await this.handle(context, envelope, async () => {
      await this.notifications.notify(
        envelope.eventId,
        envelope.type,
        envelope.payload.userId,
        '¡Tu boleto está listo!',
        `Tu boleto ${envelope.payload.ticketId} ya fue emitido. Muéstralo en la entrada.`,
      );
    });
  }

  private async handle(
    context: RmqContext,
    envelope: EventEnvelope,
    work: () => Promise<void>,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const message = context.getMessage();

    try {
      await work();
      channel.ack(message);
    } catch (err) {
      this.logger.error(
        `Fallo procesando ${envelope.type} (eventId=${envelope.eventId}): ${(err as Error).message}`,
      );
      channel.nack(message, false, false); // sin requeue -> DLQ
    }
  }
}
