import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Transport, RmqOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { assertDeadLetterTopology } from './messaging/rabbit-topology';
import { CONSUMER_NAME } from './messaging/messaging.constants';
import { EXCHANGES, deadLetterExchangeFor, queueFor } from '@event-hub/shared-types';

async function bootstrap() {
  const rabbitUrl = process.env.RABBITMQ_URL;
  if (!rabbitUrl) {
    throw new Error('RABBITMQ_URL es obligatorio para arrancar access-service');
  }

  // Debe correr ANTES de conectar el microservicio consumidor — ver el
  // comentario equivalente en tickets-service/src/main.ts.
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
      noAck: false, // manual ack — ver el comentario equivalente en tickets-service/src/main.ts
    },
  });

  await app.startAllMicroservices();

  const port = process.env.PORT ?? 3006;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`access-service escuchando en http://localhost:${port} (+ consumidor RMQ)`);
}
bootstrap();
