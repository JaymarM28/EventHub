import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InternalUserContext } from '@event-hub/internal-auth';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsClientService } from './tickets-client.service';
import { WompiClientService } from './wompi-client.service';
import { EventsClientService } from './events-client.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: {
    order: { create: jest.Mock; update: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock };
    outboxEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let ticketsClient: { reserve: jest.Mock; release: jest.Mock };
  let wompi: {
    buildCheckoutUrl: jest.Mock;
    getTransaction: jest.Mock;
    verifyEventChecksum: jest.Mock;
    refundTransaction: jest.Mock;
  };
  let eventsClient: { redeemDiscountCode: jest.Mock; getZoneOwner: jest.Mock };

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
        findMany: jest.fn().mockResolvedValue([]),
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
      refundTransaction: jest.fn(),
    };
    eventsClient = { redeemDiscountCode: jest.fn(), getZoneOwner: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: TicketsClientService, useValue: ticketsClient },
        { provide: WompiClientService, useValue: wompi },
        { provide: EventsClientService, useValue: eventsClient },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => (key === 'INTERNAL_AUTH_SECRET' ? 'test-secret' : key),
            // 0.10 (10%) — mismo default que el real, para que los montos
            // esperados en los tests de checkout no dependan de adivinar
            // qué devuelve el mock.
            get: (key: string) => (key === 'SERVICE_FEE_RATE' ? '0.10' : undefined),
          },
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
            // #24: 50 (precio) + 10% de cargo por servicio = 55 cobrados,
            // de los cuales 5 es serviceFeeAmount (nunca del organizador).
            amount: 55,
            serviceFeeAmount: 5,
            currency: 'COP',
            status: 'PENDING',
          }),
        }),
      );
      expect(wompi.buildCheckoutUrl).toHaveBeenCalledWith('order-1', 55, 'COP');
      expect(result.checkoutUrl).toBe('https://checkout.wompi.co/p/?ref=order-1');
      // El pago todavía no se confirmó — order.paid se publica recién en el webhook.
      expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
    });

    it('Fase A: el monto TOTAL (unitario × cantidad + cargo por servicio) es lo que se firma en la URL de Wompi', async () => {
      ticketsClient.reserve.mockResolvedValue({ ...reservation, quantity: 4 });

      await service.checkout('zone-1', 4, 'user-1', 'user1@example.com', headers);

      // 50 × 4 = 200 + 10% (20) de cargo por servicio = 220.
      expect(wompi.buildCheckoutUrl).toHaveBeenCalledWith('order-1', 220, 'COP');
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ quantity: 4, amount: 220, serviceFeeAmount: 20 }) }),
      );
    });

    it('si tickets-service rechaza la reserva (zona agotada), no crea ninguna orden', async () => {
      ticketsClient.reserve.mockRejectedValue(new Error('Zona agotada'));

      await expect(service.checkout('zone-1', 1, 'user-1', 'user1@example.com', headers)).rejects.toThrow('Zona agotada');
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('Fase 2 (asiento individual): reserva por seatIds y guarda las butacas en la orden', async () => {
      ticketsClient.reserve.mockResolvedValue({ ...reservation, quantity: 2, seatIds: ['seat-1', 'seat-2'] });

      await service.checkout('zone-1', ['seat-1', 'seat-2'], 'user-1', 'user1@example.com', headers);

      expect(ticketsClient.reserve).toHaveBeenCalledWith('zone-1', ['seat-1', 'seat-2'], headers);
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quantity: 2,
            seatIds: ['seat-1', 'seat-2'],
            amount: 110,
            serviceFeeAmount: 10,
          }),
        }),
      );
    });

    it('#23: código de PORCENTAJE — descuenta sobre el subtotal y guarda el código aplicado', async () => {
      eventsClient.redeemDiscountCode.mockResolvedValue({ type: 'PERCENTAGE', value: '20', zonePrice: '50' });

      await service.checkout('zone-1', 1, 'user-1', 'user1@example.com', headers, 'amigos20');

      expect(eventsClient.redeemDiscountCode).toHaveBeenCalledWith('zone-1', 'amigos20', headers);
      // subtotal 50 - descuento 10 = 40 (lo que le corresponde al
      // organizador) + 10% de cargo por servicio (4) = 44 cobrados.
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: 44,
            serviceFeeAmount: 4,
            discountCode: 'AMIGOS20',
            discountAmount: 10,
          }),
        }),
      );
      expect(wompi.buildCheckoutUrl).toHaveBeenCalledWith('order-1', 44, 'COP');
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

    it('Fase 2: transacción aprobada con seatIds en la orden — se incluyen en el payload de order.paid', async () => {
      wompi.getTransaction.mockResolvedValue({ id: 'tx-1', status: 'APPROVED', reference: 'order-1' });
      prisma.order.findUnique.mockResolvedValue({ ...order, quantity: 2, seatIds: ['seat-1', 'seat-2'] });

      await service.handleWompiWebhook(validEvent);

      expect(prisma.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payload: expect.objectContaining({ seatIds: ['seat-1', 'seat-2'] }),
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

  describe('refund (#22)', () => {
    const paidOrder = {
      id: 'order-1',
      userId: 'user-1',
      zoneId: 'zone-1',
      quantity: 1,
      seatIds: [] as string[],
      amount: '50000',
      status: 'PAID',
      wompiTransactionId: 'tx-1',
    };
    const requester: InternalUserContext = {
      userId: 'organizer-1',
      email: 'o@example.com',
      roles: ['ORGANIZER'],
      validatedAt: Date.now(),
    };
    const otherOrganizer: InternalUserContext = { ...requester, userId: 'organizer-2' };
    const superAdmin: InternalUserContext = { ...requester, userId: 'admin-1', roles: ['SUPER_ADMIN'] };

    it('reembolsa una orden PAID cuando el requester es el dueño del evento', async () => {
      prisma.order.findUnique.mockResolvedValue(paidOrder);
      eventsClient.getZoneOwner.mockResolvedValue({ eventId: 'ev-1', organizerId: 'organizer-1' });
      wompi.refundTransaction.mockResolvedValue({ id: 30677, status: 'APPROVED', amount_in_cents: 5000000 });

      await service.refund('order-1', requester, headers);

      expect(wompi.refundTransaction).toHaveBeenCalledWith('tx-1', 5000000, expect.any(String));
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1' },
          data: expect.objectContaining({ status: 'REFUNDED', wompiRefundId: '30677' }),
        }),
      );
      expect(prisma.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'order.refunded',
            payload: expect.objectContaining({ orderId: 'order-1', zoneId: 'zone-1', quantity: 1 }),
          }),
        }),
      );
    });

    it('permite a un SUPER_ADMIN reembolsar aunque no sea el organizador', async () => {
      prisma.order.findUnique.mockResolvedValue(paidOrder);
      eventsClient.getZoneOwner.mockResolvedValue({ eventId: 'ev-1', organizerId: 'organizer-1' });
      wompi.refundTransaction.mockResolvedValue({ id: 30677, status: 'APPROVED', amount_in_cents: 5000000 });

      await expect(service.refund('order-1', superAdmin, headers)).resolves.toBeUndefined();
    });

    it('rechaza a un organizador que no es dueño del evento', async () => {
      prisma.order.findUnique.mockResolvedValue(paidOrder);
      eventsClient.getZoneOwner.mockResolvedValue({ eventId: 'ev-1', organizerId: 'organizer-1' });

      await expect(service.refund('order-1', otherOrganizer, headers)).rejects.toBeInstanceOf(ForbiddenException);
      expect(wompi.refundTransaction).not.toHaveBeenCalled();
    });

    it('rechaza reembolsar una orden que no existe', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.refund('no-existe', requester, headers)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rechaza reembolsar una orden que no está PAID', async () => {
      prisma.order.findUnique.mockResolvedValue({ ...paidOrder, status: 'PENDING' });

      await expect(service.refund('order-1', requester, headers)).rejects.toBeInstanceOf(BadRequestException);
      expect(eventsClient.getZoneOwner).not.toHaveBeenCalled();
    });

    it('acepta un reembolso PENDING (verificado contra el sandbox real de Wompi) como éxito operativo', async () => {
      prisma.order.findUnique.mockResolvedValue(paidOrder);
      eventsClient.getZoneOwner.mockResolvedValue({ eventId: 'ev-1', organizerId: 'organizer-1' });
      wompi.refundTransaction.mockResolvedValue({ id: 30677, status: 'PENDING', amount_in_cents: 5000000 });

      await service.refund('order-1', requester, headers);

      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'REFUNDED' }) }),
      );
    });

    it('rechaza y no marca REFUNDED si Wompi no aprueba el reembolso', async () => {
      prisma.order.findUnique.mockResolvedValue(paidOrder);
      eventsClient.getZoneOwner.mockResolvedValue({ eventId: 'ev-1', organizerId: 'organizer-1' });
      wompi.refundTransaction.mockResolvedValue({ id: 30677, status: 'DECLINED', amount_in_cents: 5000000 });

      await expect(service.refund('order-1', requester, headers)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });
  });

  describe('refundAllForZones (#22 — cancelación de evento)', () => {
    it('reembolsa todas las órdenes PAID de las zonas dadas', async () => {
      prisma.order.findMany.mockResolvedValue([
        { id: 'order-1', userId: 'u1', zoneId: 'zone-1', quantity: 1, seatIds: [], amount: '50000', wompiTransactionId: 'tx-1' },
        { id: 'order-2', userId: 'u2', zoneId: 'zone-2', quantity: 2, seatIds: [], amount: '100000', wompiTransactionId: 'tx-2' },
      ]);
      wompi.refundTransaction.mockResolvedValue({ id: 30679, status: 'APPROVED', amount_in_cents: 0 });

      await service.refundAllForZones(['zone-1', 'zone-2']);

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { zoneId: { in: ['zone-1', 'zone-2'] }, status: 'PAID' } }),
      );
      expect(wompi.refundTransaction).toHaveBeenCalledTimes(2);
      expect(prisma.order.update).toHaveBeenCalledTimes(2);
    });

    it('una orden que falla no frena el reembolso de las demás', async () => {
      prisma.order.findMany.mockResolvedValue([
        { id: 'order-1', userId: 'u1', zoneId: 'zone-1', quantity: 1, seatIds: [], amount: '50000', wompiTransactionId: 'tx-1' },
        { id: 'order-2', userId: 'u2', zoneId: 'zone-1', quantity: 1, seatIds: [], amount: '30000', wompiTransactionId: 'tx-2' },
      ]);
      wompi.refundTransaction
        .mockRejectedValueOnce(new Error('Wompi caído'))
        .mockResolvedValueOnce({ id: 30678, status: 'APPROVED', amount_in_cents: 3000000 });

      await service.refundAllForZones(['zone-1']);

      expect(prisma.order.update).toHaveBeenCalledTimes(1);
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-2' } }),
      );
    });

    it('no hace nada si no hay zoneIds', async () => {
      await service.refundAllForZones([]);

      expect(prisma.order.findMany).not.toHaveBeenCalled();
    });
  });
});
