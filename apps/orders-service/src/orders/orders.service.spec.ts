import { Test } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { TicketsClientService } from './tickets-client.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: {
    order: { create: jest.Mock; update: jest.Mock };
    outboxEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let ticketsClient: { reserve: jest.Mock; release: jest.Mock };
  let payments: { charge: jest.Mock };

  const headers = { 'x-internal-context': 'p', 'x-internal-signature': 's' };
  const reservation = {
    reservationId: 'res-1',
    expiresAt: Date.now() + 60_000,
    zoneId: 'zone-1',
    price: 50,
  };

  beforeEach(async () => {
    prisma = {
      order: {
        create: jest.fn().mockResolvedValue({ id: 'order-1', status: 'PENDING' }),
        update: jest.fn().mockResolvedValue({}),
      },
      outboxEvent: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (ops) => Promise.all(ops)),
    };
    ticketsClient = {
      reserve: jest.fn().mockResolvedValue(reservation),
      release: jest.fn().mockResolvedValue(undefined),
    };
    payments = { charge: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: TicketsClientService, useValue: ticketsClient },
        { provide: PaymentsService, useValue: payments },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  it('checkout exitoso: reserva, cobra, marca PAID y escribe el outbox event', async () => {
    payments.charge.mockResolvedValue({ success: true });

    const result = await service.checkout('zone-1', 'user-1', headers);

    expect(ticketsClient.reserve).toHaveBeenCalledWith('zone-1', headers);
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', reservationId: 'res-1', amount: 50 }),
      }),
    );
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'order.paid',
          payload: expect.objectContaining({ orderId: 'order-1', reservationId: 'res-1' }),
        }),
      }),
    );
    expect(result.status).toBe('PAID');
    expect(ticketsClient.release).not.toHaveBeenCalled();
  });

  it('pago rechazado: marca la orden FAILED, libera la reserva y lanza 402', async () => {
    payments.charge.mockResolvedValue({ success: false });

    await expect(service.checkout('zone-1', 'user-1', headers)).rejects.toBeInstanceOf(
      HttpException,
    );

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
    expect(ticketsClient.release).toHaveBeenCalledWith('res-1', headers);
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('si tickets-service rechaza la reserva (zona agotada), no crea ninguna orden', async () => {
    ticketsClient.reserve.mockRejectedValue(new Error('Zona agotada'));

    await expect(service.checkout('zone-1', 'user-1', headers)).rejects.toThrow(
      'Zona agotada',
    );
    expect(prisma.order.create).not.toHaveBeenCalled();
  });
});
