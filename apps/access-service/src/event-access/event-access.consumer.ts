import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { EVENT_TYPES, EventEnvelope } from '@event-hub/shared-types';
import { EventAccessService } from './event-access.service';

interface EventCreatedPayload {
  id: string;
  organizerId: string;
}

interface StaffAssignedPayload {
  eventId: string;
  userId: string;
}

/**
 * Mismo patrón que ZonesConsumer en tickets-service: sync de un read-model
 * local vía eventos de dominio, ack manual (noAck: false en main.ts) para
 * que un handler que falla vaya de verdad a la DLQ en vez de darse por
 * procesado en silencio.
 */
@Controller()
export class EventAccessConsumer {
  private readonly logger = new Logger(EventAccessConsumer.name);

  constructor(private readonly eventAccess: EventAccessService) {}

  @EventPattern(EVENT_TYPES.EVENT_CREATED)
  async handleEventCreated(@Payload() envelope: EventEnvelope, @Ctx() context: RmqContext) {
    await this.handle(context, envelope, async () => {
      const payload = envelope.payload as EventCreatedPayload;
      // El organizador siempre puede escanear su propio evento, sin
      // necesidad de una asignación explícita de STAFF.
      await this.eventAccess.grant(payload.id, payload.organizerId);
    });
  }

  @EventPattern(EVENT_TYPES.EVENT_STAFF_ASSIGNED)
  async handleStaffAssigned(@Payload() envelope: EventEnvelope, @Ctx() context: RmqContext) {
    await this.handle(context, envelope, async () => {
      const payload = envelope.payload as StaffAssignedPayload;
      await this.eventAccess.grant(payload.eventId, payload.userId);
    });
  }

  private async handle(context: RmqContext, envelope: EventEnvelope, work: () => Promise<void>) {
    const channel = context.getChannelRef();
    const message = context.getMessage();
    try {
      await work();
      channel.ack(message);
    } catch (err) {
      this.logger.error(
        `Fallo sincronizando EventAccess desde ${envelope.type} (eventId=${envelope.eventId}): ${(err as Error).message}`,
      );
      channel.nack(message, false, false); // sin requeue -> DLQ
    }
  }
}
