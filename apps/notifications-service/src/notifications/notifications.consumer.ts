import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { EVENT_TYPES, EventEnvelope } from '@event-hub/shared-types';
import { NotificationsService } from './notifications.service';
import { EventsClientService } from './events-client.service';
import { OrdersClientService } from './orders-client.service';
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

interface OrderRefundedPayload {
  orderId: string;
  userId: string;
  zoneId: string;
  quantity: number;
}

interface EventReminderDuePayload {
  id: string;
  title: string;
  venue: string;
  city: string | null;
  startsAt: string;
  currency: string;
  zoneIds: string[];
}

interface WaitlistSlotAvailablePayload {
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
    private readonly ordersClient: OrdersClientService,
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
        `Tu pago de ${zone.eventTitle} se confirmó — tu boleto está en camino.`,
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
        `Ya podés ver tu boleto para ${zone.eventTitle}.`,
      );
    });
  }

  /** #22/#24 — a diferencia de order.paid, acá NO hace falta resolver la
   * zona para el organizador (el reembolso no le manda aviso a él, solo al
   * comprador que recuperó su plata). */
  @EventPattern(EVENT_TYPES.ORDER_REFUNDED)
  async handleOrderRefunded(
    @Payload() envelope: EventEnvelope<OrderRefundedPayload>,
    @Ctx() context: RmqContext,
  ) {
    await this.handle(context, envelope, async () => {
      const zone = await this.eventsClient.findZoneWithOrganizer(envelope.payload.zoneId);

      await this.notifications.notify(
        envelope.eventId,
        envelope.type,
        envelope.payload.userId,
        'Te reembolsamos tu compra',
        `<p style="margin:0;font-size:15px;color:#444;">Te devolvimos el pago de ${envelope.payload.quantity} ${envelope.payload.quantity === 1 ? 'boleto' : 'boletos'} de <strong>${zone.eventTitle}</strong> — el dinero vuelve al medio de pago con el que compraste.</p>`,
        `Te reembolsamos tu compra de ${zone.eventTitle}.`,
      );
    });
  }

  /** Notificaciones push (2026-09-29) — a diferencia de order.paid/
   * ticket.issued (un comprador específico en el payload), acá el payload
   * trae el EVENTO, no compradores — hay que resolverlos acá contra
   * orders-service (ver OrdersClientService) y notificar a cada uno con su
   * propia clave de idempotencia (mismo criterio que buyer/organizer de
   * order.paid: `ProcessedEvent` es por-eventId, así que compartir uno
   * entre varios compradores dejaría a todos menos el primero sin avisar). */
  @EventPattern(EVENT_TYPES.EVENT_REMINDER_DUE)
  async handleEventReminderDue(
    @Payload() envelope: EventEnvelope<EventReminderDuePayload>,
    @Ctx() context: RmqContext,
  ) {
    await this.handle(context, envelope, async () => {
      const { title, venue, city, startsAt, zoneIds } = envelope.payload;
      const buyerIds = await this.ordersClient.findBuyerIdsByZones(zoneIds);
      const dateLabel = new Intl.DateTimeFormat('es-CO', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'America/Bogota',
      }).format(new Date(startsAt));
      const locationLabel = city ? `${venue}, ${city}` : venue;

      for (const userId of buyerIds) {
        await this.notifications.notify(
          `${envelope.eventId}:${userId}`,
          envelope.type,
          userId,
          `${title} es mañana`,
          `<p style="margin:0;font-size:15px;color:#444;">Tu evento <strong>${title}</strong> es el ${dateLabel} en ${locationLabel} — ¡no te lo pierdas!</p>`,
          `${title} es mañana en ${locationLabel}.`,
        );
      }
    });
  }

  /** #11 (2026-09-30) — un aviso por persona (ya viene así, uno por
   * publish, ver WaitlistService.notifyFreedSlots), así que `envelope.eventId`
   * alcanza como clave de idempotencia sin necesitar sufijo (a diferencia
   * de order.paid buyer/organizer o el recordatorio de evento). */
  @EventPattern(EVENT_TYPES.WAITLIST_SLOT_AVAILABLE)
  async handleWaitlistSlotAvailable(
    @Payload() envelope: EventEnvelope<WaitlistSlotAvailablePayload>,
    @Ctx() context: RmqContext,
  ) {
    await this.handle(context, envelope, async () => {
      const zone = await this.eventsClient.findZoneWithOrganizer(envelope.payload.zoneId);

      await this.notifications.notify(
        envelope.eventId,
        envelope.type,
        envelope.payload.userId,
        '¡Se liberó un cupo!',
        `<p style="margin:0;font-size:15px;color:#444;">Se liberó un cupo en "${zone.zoneName}" para <strong>${zone.eventTitle}</strong> — comprá antes de que se agote de nuevo.</p>`,
        `Se liberó un cupo en ${zone.eventTitle} — ¡corré a comprarlo!`,
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
