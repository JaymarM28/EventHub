import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EXCHANGES } from '@event-hub/shared-types';
import { ORDER_EVENTS_CLIENT } from './messaging.constants';

/**
 * Este ClientProxy es solo para PUBLICAR — el poller del outbox
 * (outbox.service.ts) es su único consumidor. #22: orders-service SÍ pasó
 * a consumir eventos de dominio (event.cancelled, ver OrdersConsumer),
 * pero esa cola/conexión de consumidor se registra aparte en main.ts
 * (`app.connectMicroservice`), no acá — este módulo sigue siendo
 * exclusivamente el lado de publicación.
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
