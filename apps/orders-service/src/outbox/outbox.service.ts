import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { EventEnvelope } from '@event-hub/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { ORDER_EVENTS_CLIENT } from '../messaging/messaging.constants';

const BATCH_SIZE = 20;

/**
 * Poller del transactional outbox (premisa 8 de DESIGN.md). El pago se
 * confirma y la fila de outbox se escribe en la MISMA transacción de
 * Postgres (ver OrdersService.checkout) — este poller es el ÚNICO que
 * publica a RabbitMQ, desacoplado del request HTTP original. Si RabbitMQ
 * está caído, el evento simplemente espera en la tabla hasta el próximo
 * intento; nunca se pierde silenciosamente.
 */
@Injectable()
export class OutboxService implements OnModuleDestroy {
  private readonly logger = new Logger(OutboxService.name);
  private readonly maxAttempts: number;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ORDER_EVENTS_CLIENT) private readonly client: ClientProxy,
    config: ConfigService,
  ) {
    // ConfigService.get<number>() NO castea el string del .env a número
    // (visto en vivo: "5" pasado tal cual a un filtro `lt` de Prisma
    // truena con PrismaClientValidationError) — parsear explícitamente.
    this.maxAttempts = Number(config.get('OUTBOX_MAX_ATTEMPTS', '5'));
  }

  // @Interval necesita un literal en tiempo de compilación — no puede leer
  // OUTBOX_POLL_INTERVAL_MS de ConfigService aquí. Si se necesita que sea
  // configurable en runtime, migrar a SchedulerRegistry.addInterval() en
  // onModuleInit(); por ahora el valor de .env es solo documentación de
  // intención, mantenerlo en sync manualmente con este número.
  @Interval(3000)
  async pollAndPublish(): Promise<void> {
    // Evita solapar corridas si una tanda tarda más que el intervalo.
    if (this.running) return;
    this.running = true;

    try {
      const pending = await this.prisma.outboxEvent.findMany({
        where: { publishedAt: null, attempts: { lt: this.maxAttempts } },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
      });

      for (const row of pending) {
        await this.publishOne(row);
      }
    } finally {
      this.running = false;
    }
  }

  private async publishOne(row: {
    id: string;
    type: string;
    payload: unknown;
    createdAt: Date;
    attempts: number;
  }): Promise<void> {
    const envelope: EventEnvelope = {
      eventId: row.id,
      type: row.type,
      occurredAt: row.createdAt.getTime(),
      source: 'orders-service',
      payload: row.payload,
    };

    try {
      await firstValueFrom(this.client.emit(row.type, envelope));
      await this.prisma.outboxEvent.update({
        where: { id: row.id },
        data: { publishedAt: new Date() },
      });
    } catch (err) {
      const attempts = row.attempts + 1;
      const lastError = (err as Error).message;
      this.logger.error(
        `Fallo publicando outbox event ${row.id} (${row.type}), intento ${attempts}/${this.maxAttempts}: ${lastError}`,
      );
      await this.prisma.outboxEvent.update({
        where: { id: row.id },
        data: { attempts, lastError },
      });
    }
  }

  onModuleDestroy() {
    this.client.close();
  }
}
