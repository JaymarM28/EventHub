import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EXCHANGES } from '@event-hub/shared-types';
import { ORDER_EVENTS_CLIENT } from './messaging.constants';

/**
 * Solo para PUBLICAR — orders-service no consume eventos (no tiene
 * @EventPattern). El poller del outbox (outbox.service.ts) es el único
 * consumidor de este ClientProxy.
 */
@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: ORDER_EVENTS_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL')],
            queue: 'event-hub.orders-service.publisher',
            queueOptions: { durable: true },
            exchange: EXCHANGES.DOMAIN_EVENTS,
            exchangeType: 'topic',
            wildcards: true,
          },
        }),
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class MessagingModule {}
