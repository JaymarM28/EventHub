import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { EVENT_TYPES, EventEnvelope } from '@event-hub/shared-types';
import { OrdersService } from './orders.service';

interface EventCancelledPayload {
  id: string;
  organizerId: string;
  zoneIds: string[];
}

/**
 * #22 — primer y único consumidor de orders-service (hasta ahora era
 * publish-only, ver comentario histórico en messaging.module.ts). Sin
 * tabla ProcessedEvent para idempotencia: `refundAllForZones` solo toca
 * órdenes todavía en PAID, así que reprocesar el mismo event.cancelled
 * dos veces (redelivery de RabbitMQ) no reembolsa nada dos veces — la
 * propia condición de estado es la idempotencia, igual que ZonesConsumer.
 */
@Controller()
export class OrdersConsumer {
  private readonly logger = new Logger(OrdersConsumer.name);

  constructor(private readonly ordersService: OrdersService) {}

  @EventPattern(EVENT_TYPES.EVENT_CANCELLED)
  async handleEventCancelled(
    @Payload() envelope: EventEnvelope<EventCancelledPayload>,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const message = context.getMessage();

    try {
      await this.ordersService.refundAllForZones(envelope.payload.zoneIds);
      channel.ack(message);
    } catch (err) {
      this.logger.error(
        `Fallo procesando event.cancelled (eventId=${envelope.eventId}): ${(err as Error).message}`,
      );
      channel.nack(message, false, false); // sin requeue -> a la DLQ
    }
  }
}
