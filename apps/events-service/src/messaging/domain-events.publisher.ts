import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { randomUUID } from 'crypto';
import { EventEnvelope } from '@event-hub/shared-types';
import { DOMAIN_EVENTS_CLIENT } from './messaging.constants';

/**
 * Publica eventos de dominio envueltos en el EventEnvelope acordado
 * (premisa 7 de DESIGN.md). events-service es solo PUBLISHER — no tiene
 * outbox transaccional (eso es exclusivo de orders-service, premisa 8):
 * perder un event.created/updated aquí es un riesgo aceptado, no crítico
 * como perder un order.paid. Se loggea el fallo, nunca bloquea la
 * respuesta HTTP al cliente.
 */
@Injectable()
export class DomainEventsPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(DomainEventsPublisher.name);

  constructor(
    @Inject(DOMAIN_EVENTS_CLIENT) private readonly client: ClientProxy,
  ) {}

  async publish<TPayload>(
    type: string,
    payload: TPayload,
    source = 'events-service',
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
