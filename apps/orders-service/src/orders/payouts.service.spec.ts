import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayoutsService } from './payouts.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PayoutsService', () => {
  let service: PayoutsService;
  let prisma: {
    organizerPayoutAccount: { findUnique: jest.Mock; upsert: jest.Mock };
    order: { findMany: jest.Mock; updateMany: jest.Mock; aggregate: jest.Mock };
    payout: { create: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      organizerPayoutAccount: { findUnique: jest.fn(), upsert: jest.fn() },
      order: { findMany: jest.fn(), updateMany: jest.fn(), aggregate: jest.fn() },
      payout: { create: jest.fn(), findMany: jest.fn() },
      // Mismo fake que orders.service.spec.ts: corre el callback pasándole
      // un `tx` que apunta a los mismos mocks (no hay una DB real acá).
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PayoutsService,
        { provide: PrismaService, useValue: prisma },
        // holdDays default (5) — ver GARANTÍA de colchón más abajo para el caso con valor custom.
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();

    service = moduleRef.get(PayoutsService);
  });

  describe('pendingSummary', () => {
    it('sin zoneIds, no consulta la base y devuelve 0', async () => {
      const result = await service.pendingSummary([]);

      expect(prisma.order.findMany).not.toHaveBeenCalled();
      expect(result).toEqual({ pendingAmount: '0', ordersCount: 0 });
    });

    it('suma (amount - serviceFeeAmount) de las órdenes PAID sin liquidar de esas zonas', async () => {
      prisma.order.findMany.mockResolvedValue([
        { amount: 55, serviceFeeAmount: 5 },
        { amount: 110, serviceFeeAmount: 10 },
      ]);

      const result = await service.pendingSummary(['zone-1', 'zone-2']);

      expect(prisma.order.findMany).toHaveBeenCalledWith({
        where: {
          zoneId: { in: ['zone-1', 'zone-2'] },
          status: 'PAID',
          payoutId: null,
          createdAt: { lte: expect.any(Date) },
        },
        select: { amount: true, serviceFeeAmount: true },
      });
      // (55-5) + (110-10) = 150 — nunca incluye el cargo por servicio.
      expect(result).toEqual({ pendingAmount: '150.00', ordersCount: 2 });
    });

    it('GARANTÍA: el colchón contra reembolsos tardíos solo deja pasar órdenes con más de PAYOUT_HOLD_DAYS de pagadas', async () => {
      const config = { get: (key: string) => (key === 'PAYOUT_HOLD_DAYS' ? '7' : undefined) };
      const moduleRef = await Test.createTestingModule({
        providers: [
          PayoutsService,
          { provide: PrismaService, useValue: prisma },
          { provide: ConfigService, useValue: config },
        ],
      }).compile();
      const serviceWithCustomHold = moduleRef.get(PayoutsService);
      prisma.order.findMany.mockResolvedValue([]);

      await serviceWithCustomHold.pendingSummary(['zone-1']);

      const { createdAt } = prisma.order.findMany.mock.calls[0][0].where;
      const daysAgo = (Date.now() - createdAt.lte.getTime()) / (24 * 60 * 60 * 1000);
      expect(daysAgo).toBeCloseTo(7, 1);
    });
  });

  describe('settle', () => {
    it('agrupa las órdenes PAID sin liquidar en un Payout y las marca liquidadas', async () => {
      const orders = [
        { id: 'order-1', amount: 55, serviceFeeAmount: 5 },
        { id: 'order-2', amount: 110, serviceFeeAmount: 10 },
      ];
      prisma.order.findMany.mockResolvedValue(orders);
      prisma.payout.create.mockResolvedValue({ id: 'payout-1', totalAmount: 150, ordersCount: 2 });

      const result = await service.settle('organizer-1', ['zone-1'], 'transferencia-123', 'lote de septiembre');

      expect(prisma.payout.create).toHaveBeenCalledWith({
        data: {
          organizerId: 'organizer-1',
          totalAmount: 150,
          ordersCount: 2,
          status: 'SETTLED',
          externalReference: 'transferencia-123',
          notes: 'lote de septiembre',
          settledAt: expect.any(Date),
        },
      });
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['order-1', 'order-2'] } },
        data: { payoutId: 'payout-1' },
      });
      expect(result).toEqual({ id: 'payout-1', totalAmount: 150, ordersCount: 2 });
    });

    it('GARANTÍA: rechaza liquidar si no hay órdenes pendientes (evita un Payout vacío)', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await expect(service.settle('organizer-1', ['zone-1'], 'transferencia-123')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.payout.create).not.toHaveBeenCalled();
    });
  });

  describe('platformRevenue', () => {
    it('suma el cargo de servicio de las órdenes PAID, total y últimos 30 días', async () => {
      prisma.order.aggregate
        .mockResolvedValueOnce({ _sum: { serviceFeeAmount: 450 }, _count: 30 })
        .mockResolvedValueOnce({ _sum: { serviceFeeAmount: 90 } });

      const result = await service.platformRevenue();

      expect(prisma.order.aggregate).toHaveBeenNthCalledWith(1, {
        where: { status: 'PAID' },
        _sum: { serviceFeeAmount: true },
        _count: true,
      });
      expect(prisma.order.aggregate).toHaveBeenNthCalledWith(2, {
        where: { status: 'PAID', createdAt: { gte: expect.any(Date) } },
        _sum: { serviceFeeAmount: true },
      });
      expect(result).toEqual({ totalRevenue: '450', paidOrdersCount: 30, last30DaysRevenue: '90' });
    });

    it('sin órdenes PAID todavía, devuelve ceros en vez de romper con null', async () => {
      prisma.order.aggregate
        .mockResolvedValueOnce({ _sum: { serviceFeeAmount: null }, _count: 0 })
        .mockResolvedValueOnce({ _sum: { serviceFeeAmount: null } });

      const result = await service.platformRevenue();

      expect(result).toEqual({ totalRevenue: '0', paidOrdersCount: 0, last30DaysRevenue: '0' });
    });
  });
});
