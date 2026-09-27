import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { EVENT_TYPES, EventEnvelope } from '@event-hub/shared-types';
import { NotificationsService } from './notifications.service';
import { EventsClientService } from './events-client.service';
import { renderTicketDetails } from './email-template';

interface OrderPaidPayload {
  orderId: string;
  userId: string;
  zoneId: string;
  quantity: number;
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

  constructor(
    private readonly notifications: NotificationsService,
    private readonly eventsClient: EventsClientService,
  ) {}

  /**
   * Cada order.paid dispara DOS notificaciones independientes (comprador +
   * organizador) — cada una necesita su propia clave de idempotencia
   * (`${envelope.eventId}:buyer` / `:organizer`), porque ProcessedEvent
   * usa esa clave como PK: si ambas llamadas a `notify()` compartieran el
   * mismo `eventId`, la segunda vería "ya procesado" por la primera y
   * jamás se enviaría.
   */
  @EventPattern(EVENT_TYPES.ORDER_PAID)
  async handleOrderPaid(
    @Payload() envelope: EventEnvelope<OrderPaidPayload>,
    @Ctx() context: RmqContext,
  ) {
    await this.handle(context, envelope, async () => {
      // Un solo salto de red para ambos correos (comprador y organizador)
      // — antes se pedía dos veces (una implícita en el body plano del
      // comprador, que ni siquiera mostraba el evento).
      const zone = await this.eventsClient.findZoneWithOrganizer(envelope.payload.zoneId);
      const quantity = envelope.payload.quantity;
      const totalAmount = (Number(zone.zonePrice) * quantity).toString();

      await this.notifications.notify(
        `${envelope.eventId}:buyer`,
        envelope.type,
        envelope.payload.userId,
        'Confirmamos tu pago',
        renderTicketDetails({
          eventTitle: zone.eventTitle,
          venue: zone.venue,
          city: zone.city,
          startsAt: new Date(zone.startsAt),
          zoneName: zone.zoneName,
          quantity,
          totalAmount,
          currency: zone.currency,
        }),
      );

      await this.notifications.notify(
        `${envelope.eventId}:organizer`,
        envelope.type,
        zone.organizerId,
        '¡Nueva venta en tu evento!',
        `<p style="margin:0;font-size:15px;color:#444;">Se vendieron ${quantity} ${quantity === 1 ? 'boleto' : 'boletos'} de "${zone.zoneName}" para <strong>${zone.eventTitle}</strong>.</p>`,
      );
    });
  }

  @EventPattern(EVENT_TYPES.TICKET_ISSUED)
  async handleTicketIssued(
    @Payload() envelope: EventEnvelope<TicketIssuedPayload>,
    @Ctx() context: RmqContext,
  ) {
    await this.handle(context, envelope, async () => {
      const zone = await this.eventsClient.findZoneWithOrganizer(envelope.payload.zoneId);

      await this.notifications.notify(
        envelope.eventId,
        envelope.type,
        envelope.payload.userId,
        '¡Tu boleto está listo!',
        renderTicketDetails({
          eventTitle: zone.eventTitle,
          venue: zone.venue,
          city: zone.city,
          startsAt: new Date(zone.startsAt),
          zoneName: zone.zoneName,
          quantity: 1,
          totalAmount: zone.zonePrice,
          currency: zone.currency,
        }),
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
