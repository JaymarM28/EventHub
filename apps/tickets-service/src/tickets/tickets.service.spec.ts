import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TicketsService } from './tickets.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { DomainEventsPublisher } from '../messaging/domain-events.publisher';

describe('TicketsService', () => {
  let service: TicketsService;
  let prisma: {
    processedEvent: { findUnique: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    $queryRaw: jest.Mock;
    ticket: { count: jest.Mock; create: jest.Mock };
    processedEvent: { create: jest.Mock };
  };
  let redis: { release: jest.Mock };
  let publisher: { publish: jest.Mock };

  const payload = {
    orderId: 'order-1',
    userId: 'user-1',
    zoneId: 'zone-1',
    reservationId: 'res-1',
  };

  beforeEach(async () => {
    tx = {
      $queryRaw: jest.fn(),
      ticket: { count: jest.fn(), create: jest.fn() },
      processedEvent: { create: jest.fn() },
    };
    prisma = {
      processedEvent: { findUnique: jest.fn(), create: jest.fn() },
      $transaction: jest.fn(async (cb) => cb(tx)),
    };
    redis = { release: jest.fn().mockResolvedValue(undefined) };
    publisher = { publish: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: DomainEventsPublisher, useValue: publisher },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'test-qr-secret' },
        },
      ],
    }).compile();

    service = moduleRef.get(TicketsService);
  });

  it('no reprocesa un eventId ya visto (idempotencia)', async () => {
    prisma.processedEvent.findUnique.mockResolvedValue({ eventId: 'ev-1' });

    await service.confirmFromOrder('ev-1', payload);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('crea el ticket, marca el evento procesado, libera el soft hold y publica ticket.issued', async () => {
    prisma.processedEvent.findUnique.mockResolvedValue(null);
    tx.$queryRaw.mockResolvedValue([{ id: 'zone-1', capacity: 10 }]);
    tx.ticket.count.mockResolvedValue(3); // 3 confirmados, cupo 10 — hay lugar

    await service.confirmFromOrder('ev-2', payload);

    expect(tx.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          zoneId: 'zone-1',
          userId: 'user-1',
          orderId: 'order-1',
          reservationId: 'res-1',
        }),
      }),
    );
    expect(tx.processedEvent.create).toHaveBeenCalledWith({
      data: { eventId: 'ev-2', eventType: 'order.paid' },
    });
    expect(redis.release).toHaveBeenCalledWith('zone-1', 'res-1');
    expect(publisher.publish).toHaveBeenCalledWith(
      'ticket.issued',
      expect.objectContaining({ orderId: 'order-1', userId: 'user-1' }),
    );
  });

  it('rechaza si la zona no existe', async () => {
    prisma.processedEvent.findUnique.mockResolvedValue(null);
    tx.$queryRaw.mockResolvedValue([]);

    await expect(service.confirmFromOrder('ev-3', payload)).rejects.toThrow(
      /no encontrada/,
    );
    expect(tx.ticket.create).not.toHaveBeenCalled();
  });

  it('GARANTÍA DURA: rechaza si la zona ya está en capacidad completa, aunque Redis haya dejado pasar la reserva', async () => {
    prisma.processedEvent.findUnique.mockResolvedValue(null);
    tx.$queryRaw.mockResolvedValue([{ id: 'zone-1', capacity: 5 }]);
    tx.ticket.count.mockResolvedValue(5); // ya vendidos = capacidad exacta

    await expect(service.confirmFromOrder('ev-4', payload)).rejects.toThrow(
      /sobrevendida/,
    );
    expect(tx.ticket.create).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});
