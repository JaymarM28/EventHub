import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsClientService } from './tickets-client.service';
import { WompiClientService } from './wompi-client.service';
import { EventsClientService } from './events-client.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: {
    order: { create: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
    outboxEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let ticketsClient: { reserve: jest.Mock; release: jest.Mock };
  let wompi: { buildCheckoutUrl: jest.Mock; getTransaction: jest.Mock; verifyEventChecksum: jest.Mock };
  let eventsClient: { redeemDiscountCode: jest.Mock };

  const headers = { 'x-internal-context': 'p', 'x-internal-signature': 's' };
  const reservation = {
    reservationId: 'res-1',
    expiresAt: Date.now() + 60_000,
    zoneId: 'zone-1',
    quantity: 1,
    price: 50, // unitario
    currency: 'COP',
  };
  const validEvent = {
    data: { transaction: { id: 'tx-1', status: 'APPROVED', reference: 'order-1' } },
    signature: { properties: ['transaction.id', 'transaction.status'], checksum: 'ok' },
    timestamp: 123,
  };

  beforeEach(async () => {
    prisma = {
      order: {
        create: jest.fn().mockResolvedValue({ id: 'order-1', status: 'PENDING', userId: 'user-1' }),
        update: jest.fn().mockResolvedValue({ id: 'order-1', status: 'PENDING', userId: 'user-1' }),
        findUnique: jest.fn(),
      },
      outboxEvent: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (ops) => Promise.all(ops)),
    };
    ticketsClient = {
      reserve: jest.fn().mockResolvedValue(reservation),
      release: jest.fn().mockResolvedValue(undefined),
    };
    wompi = {
      buildCheckoutUrl: jest.fn().mockReturnValue('https://checkout.wompi.co/p/?ref=order-1'),
      getTransaction: jest.fn(),
      verifyEventChecksum: jest.fn().mockReturnValue(true),
    };
    eventsClient = { redeemDiscountCode: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: TicketsClientService, useValue: ticketsClient },
        { provide: WompiClientService, useValue: wompi },
        { provide: EventsClientService, useValue: eventsClient },
        {
          provide: ConfigService,
          useValue: { getOrThrow: (key: string) => (key === 'INTERNAL_AUTH_SECRET' ? 'test-secret' : key) },
        },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  describe('checkout', () => {
    it('reserva, crea la orden PENDING y arma la URL de checkout de Wompi', async () => {
      const result = await service.checkout('zone-1', 1, 'user-1', 'user1@example.com', headers);

      expect(ticketsClient.reserve).toHaveBeenCalledWith('zone-1', 1, headers);
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            reservationId: 'res-1',
            quantity: 1,
            amount: 50,
            currency: 'COP',
            status: 'PENDING',
          }),
        }),
      );
      expect(wompi.buildCheckoutUrl).toHaveBeenCalledWith('order-1', 50, 'COP');
      expect(result.checkoutUrl).toBe('https://checkout.wompi.co/p/?ref=order-1');
      // El pago todavía no se confirmó — order.paid se publica recién en el webhook.
      expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
    });

    it('Fase A: el monto TOTAL (unitario × cantidad) es lo que se firma en la URL de Wompi', async () => {
      ticketsClient.reserve.mockResolvedValue({ ...reservation, quantity: 4 });

      await service.checkout('zone-1', 4, 'user-1', 'user1@example.com', headers);

      expect(wompi.buildCheckoutUrl).toHaveBeenCalledWith('order-1', 200, 'COP');
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ quantity: 4, amount: 200 }) }),
      );
    });

    it('si tickets-service rechaza la reserva (zona agotada), no crea ninguna orden', async () => {
      ticketsClient.reserve.mockRejectedValue(new Error('Zona agotada'));

      await expect(service.checkout('zone-1', 1, 'user-1', 'user1@example.com', headers)).rejects.toThrow('Zona agotada');
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('#23: código de PORCENTAJE — descuenta sobre el subtotal y guarda el código aplicado', async () => {
      eventsClient.redeemDiscountCode.mockResolvedValue({ type: 'PERCENTAGE', value: '20', zonePrice: '50' });

      await service.checkout('zone-1', 1, 'user-1', 'user1@example.com', headers, 'amigos20');

      expect(eventsClient.redeemDiscountCode).toHaveBeenCalledWith('zone-1', 'amigos20', headers);
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 40, discountCode: 'AMIGOS20', discountAmount: 10 }),
        }),
      );
      expect(wompi.buildCheckoutUrl).toHaveBeenCalledWith('order-1', 40, 'COP');
    });

    it('#23: código de MONTO FIJO — nunca deja el total en negativo', async () => {
      eventsClient.redeemDiscountCode.mockResolvedValue({ type: 'FIXED', value: '1000', zonePrice: '50' });

      await service.checkout('zone-1', 1, 'user-1', 'user1@example.com', headers, 'REGALO');

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amount: 0, discountAmount: 50 }) }),
      );
    });

    it('#23: código inválido — libera la reserva y no crea ninguna orden', async () => {
      eventsClient.redeemDiscountCode.mockRejectedValue(new Error('Código de descuento inválido'));

      await expect(
        service.checkout('zone-1', 1, 'user-1', 'user1@example.com', headers, 'NOEXISTE'),
      ).rejects.toThrow('Código de descuento inválido');

      expect(ticketsClient.release).toHaveBeenCalledWith('res-1', headers);
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('sin código de descuento: no llama a events-service', async () => {
      await service.checkout('zone-1', 1, 'user-1', 'user1@example.com', headers);

      expect(eventsClient.redeemDiscountCode).not.toHaveBeenCalled();
    });
  });

  describe('handleWompiWebhook', () => {
    const order = {
      id: 'order-1',
      userId: 'user-1',
      zoneId: 'zone-1',
      reservationId: 'res-1',
      quantity: 1,
      status: 'PENDING',
    };

    it('checksum inválido: se ignora el evento sin siquiera re-consultar Wompi', async () => {
      wompi.verifyEventChecksum.mockReturnValue(false);

      await service.handleWompiWebhook(validEvent);

      expect(wompi.getTransaction).not.toHaveBeenCalled();
      expect(prisma.order.findUnique).not.toHaveBeenCalled();
    });

    it('transacción aprobada: marca PAID, guarda el id de la transacción y publica order.paid en la misma transacción', async () => {
      wompi.getTransaction.mockResolvedValue({ id: 'tx-1', status: 'APPROVED', reference: 'order-1' });
      prisma.order.findUnique.mockResolvedValue(order);

      await service.handleWompiWebhook(validEvent);

      expect(wompi.getTransaction).toHaveBeenCalledWith('tx-1');
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: 'PAID', wompiTransactionId: 'tx-1' },
      });
      expect(prisma.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'order.paid',
            payload: expect.objectContaining({ orderId: 'order-1', reservationId: 'res-1' }),
          }),
        }),
      );
    });

    it('evento duplicado (orden ya no está PENDING): no reprocesa', async () => {
      wompi.getTransaction.mockResolvedValue({ id: 'tx-1', status: 'APPROVED', reference: 'order-1' });
      prisma.order.findUnique.mockResolvedValue({ ...order, status: 'PAID' });

      await service.handleWompiWebhook(validEvent);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('transacción sin orden asociada (reference huérfana): no rompe', async () => {
      wompi.getTransaction.mockResolvedValue({ id: 'tx-1', status: 'APPROVED', reference: 'no-existe' });
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.handleWompiWebhook(validEvent)).resolves.toBeUndefined();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('transacción rechazada (DECLINED): marca FAILED y libera la reserva con headers de sistema', async () => {
      wompi.getTransaction.mockResolvedValue({ id: 'tx-1', status: 'DECLINED', reference: 'order-1' });
      prisma.order.findUnique.mockResolvedValue(order);

      await service.handleWompiWebhook(validEvent);

      expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: { status: 'FAILED' } });
      expect(ticketsClient.release).toHaveBeenCalledWith('res-1', expect.any(Object));
    });

    it('transacción pendiente: no hace nada todavía', async () => {
      wompi.getTransaction.mockResolvedValue({ id: 'tx-1', status: 'PENDING', reference: 'order-1' });
      prisma.order.findUnique.mockResolvedValue(order);

      await service.handleWompiWebhook(validEvent);

      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(ticketsClient.release).not.toHaveBeenCalled();
    });

    it('evento sin transaction.id: se ignora sin consultar Wompi', async () => {
      await service.handleWompiWebhook({ ...validEvent, data: {} });

      expect(wompi.getTransaction).not.toHaveBeenCalled();
    });
  });
});
