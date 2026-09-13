import { Test } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    processedEvent: { findUnique: jest.Mock; create: jest.Mock };
    notification: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      processedEvent: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({}) },
      notification: { create: jest.fn() },
      $transaction: jest.fn(async (ops) => Promise.all(ops)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [NotificationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(NotificationsService);
  });

  it('no reprocesa un eventId ya visto (idempotencia)', async () => {
    prisma.processedEvent.findUnique.mockResolvedValue({ eventId: 'ev-1' });

    await service.notify('ev-1', 'order.paid', 'user-1', 'asunto', 'cuerpo');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('crea la notificación y marca el evento procesado en la misma transacción', async () => {
    prisma.processedEvent.findUnique.mockResolvedValue(null);
    prisma.notification.create.mockResolvedValue({});

    await service.notify('ev-2', 'ticket.issued', 'user-1', 'Tu boleto está listo', 'cuerpo');

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          subject: 'Tu boleto está listo',
        }),
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
