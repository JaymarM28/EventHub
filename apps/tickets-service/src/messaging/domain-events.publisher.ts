import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { randomUUID } from 'crypto';
import { EventEnvelope } from '@event-hub/shared-types';
import { TICKET_EVENTS_CLIENT } from './messaging.constants';

@Injectable()
export class DomainEventsPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(DomainEventsPublisher.name);

  constructor(
    @Inject(TICKET_EVENTS_CLIENT) private readonly client: ClientProxy,
  ) {}

  async publish<TPayload>(
    type: string,
    payload: TPayload,
    source = 'tickets-service',
  ): Promise<void> {
    const envelope: EventEnvelope<TPayload> = {
      eventId: randomUUID(),
      type,
      occurredAt: Date.now(),
      source,
      payload,
    };

    try {
      await firstValueFrom(this.client.emit(type, envelope));
    } catch (err) {
      this.logger.error(
        `Fallo al publicar evento "${type}" (eventId=${envelope.eventId}): ${(err as Error).message}`,
      );
    }
  }

  onModuleDestroy() {
    this.client.close();
  }
}
