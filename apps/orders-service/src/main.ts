import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Transport, RmqOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { assertDeadLetterTopology } from './messaging/rabbit-topology';
import { CONSUMER_NAME } from './messaging/messaging.constants';
import {
  EXCHANGES,
  deadLetterExchangeFor,
  queueFor,
} from '@event-hub/shared-types';

async function bootstrap() {
  const rabbitUrl = process.env.RABBITMQ_URL;
  if (!rabbitUrl) {
    throw new Error('RABBITMQ_URL es obligatorio para arrancar orders-service');
  }

  // #22 — orders-service pasa de publish-only a también consumir
  // event.cancelled (reembolso en bloque). Debe correr ANTES de conectar
  // el microservicio consumidor, mismo motivo que tickets-service.
  await assertDeadLetterTopology(rabbitUrl, CONSUMER_NAME);

  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  app.connectMicroservice<RmqOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitUrl],
      queue: queueFor(CONSUMER_NAME),
      queueOptions: {
        durable: true,
        deadLetterExchange: deadLetterExchangeFor(CONSUMER_NAME),
      },
      exchange: EXCHANGES.DOMAIN_EVENTS,
      exchangeType: 'topic',
      wildcards: true,
      noAck: false,
    },
  });

  await app.startAllMicroservices();

  const port = process.env.PORT ?? 3004;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`orders-service escuchando en http://localhost:${port} (+ consumidor RMQ)`);
}
bootstrap();
