import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { EVENT_TYPES, EventEnvelope } from '@event-hub/shared-types';
import { OrderPaidPayload, TicketsService } from './tickets.service';

@Controller()
export class TicketsConsumer {
  private readonly logger = new Logger(TicketsConsumer.name);

  constructor(private readonly ticketsService: TicketsService) {}

  @EventPattern(EVENT_TYPES.ORDER_PAID)
  async handleOrderPaid(
    @Payload() envelope: EventEnvelope<OrderPaidPayload>,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const message = context.getMessage();

    try {
      await this.ticketsService.confirmFromOrder(envelope.eventId, envelope.payload);
      channel.ack(message);
    } catch (err) {
      this.logger.error(
        `Fallo confirmando order.paid (eventId=${envelope.eventId}, orderId=${envelope.payload.orderId}): ${(err as Error).message}`,
      );
      channel.nack(message, false, false); // sin requeue -> DLQ
    }
  }

  /** #22 — anula los boletos de una orden reembolsada (orders-service, ver
   * OrdersService.performRefund). */
  @EventPattern(EVENT_TYPES.ORDER_REFUNDED)
  async handleOrderRefunded(
    @Payload() envelope: EventEnvelope<{ orderId: string }>,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const message = context.getMessage();

    try {
      await this.ticketsService.refundByOrder(envelope.payload.orderId);
      channel.ack(message);
    } catch (err) {
      this.logger.error(
        `Fallo procesando order.refunded (eventId=${envelope.eventId}, orderId=${envelope.payload.orderId}): ${(err as Error).message}`,
      );
      channel.nack(message, false, false);
    }
  }
}
