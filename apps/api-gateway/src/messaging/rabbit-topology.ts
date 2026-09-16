import * as amqplib from 'amqplib';
import { deadLetterExchangeFor, deadLetterQueueFor } from '@event-hub/shared-types';

/**
 * @nestjs/microservices declara la cola principal y el exchange de dominio
 * automáticamente (ver MessagingModule/main.ts), pero NO crea la
 * infraestructura de dead-letter — eso hay que declararlo aparte, una vez,
 * antes de que arranque el consumidor. Si `x-dead-letter-exchange` apunta a
 * un exchange que no existe, RabbitMQ descarta el mensaje en silencio en
 * vez de mandarlo a la DLQ.
 *
 * Se ejecuta con una conexión propia y efímera (se cierra al terminar) —
 * separada de la conexión que usa el ClientsModule/microservicio.
 */
export async function assertDeadLetterTopology(
  rabbitUrl: string,
  consumerService: string,
): Promise<void> {
  const connection = await amqplib.connect(rabbitUrl);
  const channel = await connection.createChannel();

  const dlx = deadLetterExchangeFor(consumerService);
  const dlq = deadLetterQueueFor(consumerService);

  await channel.assertExchange(dlx, 'fanout', { durable: true });
  await channel.assertQueue(dlq, { durable: true });
  await channel.bindQueue(dlq, dlx, '');

  await channel.close();
  await connection.close();
}
