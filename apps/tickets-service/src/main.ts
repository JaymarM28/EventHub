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
    throw new Error('RABBITMQ_URL es obligatorio para arrancar tickets-service');
  }

  // Debe correr ANTES de conectar el microservicio consumidor — si
  // `deadLetterExchange` apunta a un exchange inexistente, RabbitMQ
  // descarta los mensajes fallidos en silencio en vez de mandarlos a la DLQ.
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
      // Manual ack: por defecto @nestjs/microservices auto-acknowlege ANTES
      // de correr el handler (noAck:true) — sin esto, un handler que falla
      // igual se da por procesado y nunca llega a la DLQ.
      noAck: false,
    },
  });

  await app.startAllMicroservices();

  const port = process.env.PORT ?? 3003;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`tickets-service escuchando en http://localhost:${port} (+ consumidor RMQ)`);
}
bootstrap();
