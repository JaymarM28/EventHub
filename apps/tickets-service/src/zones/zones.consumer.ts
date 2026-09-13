import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { EVENT_TYPES, EventEnvelope } from '@event-hub/shared-types';
import { ZonesService } from './zones.service';

@Controller()
export class ZonesConsumer {
  private readonly logger = new Logger(ZonesConsumer.name);

  constructor(private readonly zonesService: ZonesService) {}

  @EventPattern(EVENT_TYPES.EVENT_CREATED)
  async handleEventCreated(
    @Payload() envelope: EventEnvelope,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const message = context.getMessage();

    try {
      await this.zonesService.syncFromEvent(envelope.payload as never);
      channel.ack(message);
    } catch (err) {
      this.logger.error(
        `Fallo sincronizando zonas desde event.created (eventId=${envelope.eventId}): ${(err as Error).message}`,
      );
      channel.nack(message, false, false); // sin requeue -> a la DLQ (deadLetterExchange en options de la cola)
    }
  }
}
