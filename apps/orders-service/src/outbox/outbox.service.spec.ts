import { of, throwError } from 'rxjs';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OutboxService } from './outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { ORDER_EVENTS_CLIENT } from '../messaging/messaging.constants';

describe('OutboxService', () => {
  let service: OutboxService;
  let prisma: {
    outboxEvent: { findMany: jest.Mock; update: jest.Mock };
  };
  let client: { emit: jest.Mock };

  const row = {
    id: 'ev-1',
    type: 'order.paid',
    payload: { orderId: 'order-1' },
    createdAt: new Date(),
    attempts: 0,
  };

  beforeEach(async () => {
    prisma = {
      outboxEvent: {
        findMany: jest.fn().mockResolvedValue([row]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    client = { emit: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxService,
        { provide: PrismaService, useValue: prisma },
        { provide: ORDER_EVENTS_CLIENT, useValue: client },
        { provide: ConfigService, useValue: { get: (_k: string, fallback: number) => fallback } },
      ],
    }).compile();

    service = moduleRef.get(OutboxService);
  });

  it('publica un evento pendiente y lo marca como publicado', async () => {
    client.emit.mockReturnValue(of(undefined));

    await service.pollAndPublish();

    expect(client.emit).toHaveBeenCalledWith('order.paid', expect.objectContaining({ eventId: 'ev-1' }));
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ev-1' },
        data: expect.objectContaining({ publishedAt: expect.any(Date) }),
      }),
    );
  });

  it('si falla la publicación, incrementa attempts y guarda el error (no marca publishedAt)', async () => {
    client.emit.mockReturnValue(throwError(() => new Error('RabbitMQ caído')));

    await service.pollAndPublish();

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ev-1' },
        data: { attempts: 1, lastError: 'RabbitMQ caído' },
      }),
    );
  });

  it('no solapa corridas si una tanda ya está en curso', async () => {
    let resolveEmit: () => void;
    client.emit.mockReturnValue(
      of(undefined) as never, // primera llamada resuelve rápido para simplificar
    );
    prisma.outboxEvent.findMany.mockResolvedValueOnce(
      new Promise((resolve) => {
        resolveEmit = () => resolve([row]);
      }) as never,
    );

    const firstRun = service.pollAndPublish();
    const secondRun = service.pollAndPublish(); // debe salir de inmediato (running=true)

    resolveEmit!();
    await Promise.all([firstRun, secondRun]);

    // Solo la primera corrida realmente consultó y publicó.
    expect(prisma.outboxEvent.findMany).toHaveBeenCalledTimes(1);
  });
});
