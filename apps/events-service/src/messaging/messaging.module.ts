import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EXCHANGES } from '@event-hub/shared-types';
import { DOMAIN_EVENTS_CLIENT } from './messaging.constants';
import { DomainEventsPublisher } from './domain-events.publisher';

/**
 * Cliente RMQ configurado para publicar a un exchange tipo "topic"
 * (Finding 4 del eng review: usar @nestjs/microservices en vez de amqplib
 * manual). Cada evento se publica con routing key = su `type`
 * (ej. "event.created") — los futuros consumidores (tickets-service,
 * notifications-service) declaran su PROPIA cola y la bindean a este mismo
 * exchange con el patrón que les interese; el publisher no necesita saber
 * quién consume.
 */
@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: DOMAIN_EVENTS_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL')],
            queue: 'event-hub.events-service.publisher',
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
