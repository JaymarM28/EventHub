import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EXCHANGES } from '@event-hub/shared-types';
import { TICKET_EVENTS_CLIENT } from './messaging.constants';
import { DomainEventsPublisher } from './domain-events.publisher';

/**
 * Cliente para PUBLICAR (ticket.issued). El consumo (event.created,
 * order.paid) se configura por separado en main.ts vía
 * app.connectMicroservice(), que es quien declara la cola propia de
 * tickets-service — este ClientProxy solo emite, no escucha.
 */
@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: TICKET_EVENTS_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL')],
            queue: 'event-hub.tickets-service.publisher',
            queueOptions: { durable: true },
            exchange: EXCHANGES.DOMAIN_EVENTS,
            exchangeType: 'topic',
            wildcards: true,
          },
        }),
      },
    ]),
  ],
  providers: [DomainEventsPublisher],
  exports: [DomainEventsPublisher],
})
export class MessagingModule {}
