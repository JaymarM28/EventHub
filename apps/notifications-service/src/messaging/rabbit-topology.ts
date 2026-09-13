import * as amqplib from 'amqplib';
import { deadLetterExchangeFor, deadLetterQueueFor } from '@event-hub/shared-types';

/**
 * Mismo bootstrap que tickets-service (ver el comentario completo ahí) —
 * @nestjs/microservices no crea la infraestructura de dead-letter sola.
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
