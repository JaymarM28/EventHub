import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { DomainEventsPublisher } from '../messaging/domain-events.publisher';
import { AuthClientService } from './auth-client.service';

describe('TicketsService', () => {
  let service: TicketsService;
  let prisma: {
    processedEvent: { findUnique: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
    ticket: {
      updateMany: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
      update: jest.Mock;
    };
    eventZone: { findUnique: jest.Mock; findMany: jest.Mock };
  };
  let tx: {
    $queryRaw: jest.Mock;
    ticket: { count: jest.Mock; create: jest.Mock };
    processedEvent: { create: jest.Mock };
  };
  let redis: { release: jest.Mock };
  let publisher: { publish: jest.Mock };
  let authClient: { findByEmail: jest.Mock };

  const payload = {
    orderId: 'order-1',
    userId: 'user-1',
    zoneId: 'zone-1',
    reservationId: 'res-1',
    quantity: 1,
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
      $queryRaw: jest.fn(),
      ticket: {
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
        update: jest.fn(),
      },
      eventZone: { findUnique: jest.fn(), findMany: jest.fn() },
    };
    redis = { release: jest.fn().mockResolvedValue(undefined) };
    publisher = { publish: jest.fn().mockResolvedValue(undefined) };
    authClient = { findByEmail: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: DomainEventsPublisher, useValue: publisher },
        { provide: AuthClientService, useValue: authClient },
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

  it('Fase A: crea un ticket por cada unidad de `quantity`, todos con el mismo orderId, y publica un ticket.issued por cada uno', async () => {
    prisma.processedEvent.findUnique.mockResolvedValue(null);
    tx.$queryRaw.mockResolvedValue([{ id: 'zone-1', capacity: 10 }]);
    tx.ticket.count.mockResolvedValue(3); // 3 confirmados, cupo 10 — piden 4, hay lugar

    await service.confirmFromOrder('ev-multi', { ...payload, quantity: 4 });

    expect(tx.ticket.create).toHaveBeenCalledTimes(4);
    expect(publisher.publish).toHaveBeenCalledTimes(4);
    const ticketIds = tx.ticket.create.mock.calls.map((call) => call[0].data.id);
    expect(new Set(ticketIds).size).toBe(4); // cuatro ids distintos, no el mismo repetido
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

  it('GARANTÍA DURA (Fase A): rechaza si alcanza para ALGUNOS boletos de la orden pero no para todos', async () => {
    prisma.processedEvent.findUnique.mockResolvedValue(null);
    tx.$queryRaw.mockResolvedValue([{ id: 'zone-1', capacity: 5 }]);
    tx.ticket.count.mockResolvedValue(3); // quedan 2, pero la orden pide 4 — nunca emitir solo la mitad

    await expect(service.confirmFromOrder('ev-5', { ...payload, quantity: 4 })).rejects.toThrow(
      /sobrevendida/,
    );
    expect(tx.ticket.create).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  describe('findByUser', () => {
    it('enriquece cada boleto con eventId/nombre/precio de zona ("Mis boletos" en la app)', async () => {
      prisma.ticket.findMany.mockResolvedValue([
        { id: 'ticket-1', zoneId: 'zone-1', userId: 'user-1', orderId: 'order-1', qrToken: 'q1', scannedAt: null },
        { id: 'ticket-2', zoneId: 'zone-2', userId: 'user-1', orderId: 'order-2', qrToken: 'q2', scannedAt: null },
      ]);
      prisma.eventZone.findMany.mockResolvedValue([
        { id: 'zone-1', eventId: 'event-1', name: 'General', price: 50 },
        { id: 'zone-2', eventId: 'event-2', name: 'VIP', price: 200 },
      ]);

      const result = await service.findByUser('user-1');

      expect(prisma.eventZone.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['zone-1', 'zone-2'] } },
      });
      expect(result).toEqual([
        expect.objectContaining({ id: 'ticket-1', eventId: 'event-1', zoneName: 'General', zonePrice: 50 }),
        expect.objectContaining({ id: 'ticket-2', eventId: 'event-2', zoneName: 'VIP', zonePrice: 200 }),
      ]);
    });

    it('no rompe si una zona no está sincronizada (eventId/zoneName/zonePrice quedan null)', async () => {
      prisma.ticket.findMany.mockResolvedValue([
        { id: 'ticket-1', zoneId: 'zone-huerfana', userId: 'user-1', orderId: 'order-1', qrToken: 'q1', scannedAt: null },
      ]);
      prisma.eventZone.findMany.mockResolvedValue([]);

      const result = await service.findByUser('user-1');

      expect(result).toEqual([
        expect.objectContaining({ id: 'ticket-1', eventId: null, zoneName: null, zonePrice: null }),
      ]);
    });
  });

  describe('assignTo', () => {
    it('actualiza assignedToName cuando el que pide es el dueño del boleto', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ id: 'ticket-1', userId: 'user-1' });
      prisma.ticket.update.mockResolvedValue({ id: 'ticket-1', userId: 'user-1', assignedToName: 'Ana' });

      const result = await service.assignTo('ticket-1', 'user-1', 'Ana');

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 'ticket-1' },
        data: { assignedToName: 'Ana' },
      });
      expect(result).toEqual(expect.objectContaining({ assignedToName: 'Ana' }));
    });

    it('rechaza si el boleto no es del que pide asignarlo', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ id: 'ticket-1', userId: 'user-1' });

      await expect(service.assignTo('ticket-1', 'user-2', 'Ana')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el boleto no existe', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null);

      await expect(service.assignTo('no-existe', 'user-1', 'Ana')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('transferTo', () => {
    const headers = { 'x-internal-context': 'p', 'x-internal-signature': 's' };

    it('reasigna el userId del boleto al destinatario encontrado por email y limpia assignedToName', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ id: 'ticket-1', userId: 'user-1', scannedAt: null });
      authClient.findByEmail.mockResolvedValue({ id: 'user-2', email: 'friend@b.com' });
      prisma.ticket.update.mockResolvedValue({ id: 'ticket-1', userId: 'user-2' });

      const result = await service.transferTo('ticket-1', 'user-1', 'friend@b.com', headers);

      expect(authClient.findByEmail).toHaveBeenCalledWith('friend@b.com', headers);
      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 'ticket-1' },
        data: { userId: 'user-2', assignedToName: null },
      });
      expect(result).toEqual(expect.objectContaining({ userId: 'user-2' }));
    });

    it('rechaza si el boleto no es del que pide transferirlo', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ id: 'ticket-1', userId: 'user-1', scannedAt: null });

      await expect(service.transferTo('ticket-1', 'user-2', 'friend@b.com', headers)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(authClient.findByEmail).not.toHaveBeenCalled();
    });

    it('rechaza transferir un boleto ya utilizado', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ id: 'ticket-1', userId: 'user-1', scannedAt: new Date() });

      await expect(service.transferTo('ticket-1', 'user-1', 'friend@b.com', headers)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(authClient.findByEmail).not.toHaveBeenCalled();
    });

    it('rechaza transferirse un boleto a uno mismo', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ id: 'ticket-1', userId: 'user-1', scannedAt: null });
      authClient.findByEmail.mockResolvedValue({ id: 'user-1', email: 'yo@b.com' });

      await expect(service.transferTo('ticket-1', 'user-1', 'yo@b.com', headers)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el boleto no existe', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null);

      await expect(service.transferTo('no-existe', 'user-1', 'friend@b.com', headers)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('validateScan', () => {
    it('marca el boleto como usado y devuelve valid:true en el primer escaneo', async () => {
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticket.findUniqueOrThrow.mockResolvedValue({
        id: 'ticket-1',
        zoneId: 'zone-1',
        userId: 'user-1',
      });

      const result = await service.validateScan('ticket-1');

      expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 'ticket-1', scannedAt: null },
        data: { scannedAt: expect.any(Date) },
      });
      expect(result).toEqual({
        valid: true,
        ticket: { id: 'ticket-1', zoneId: 'zone-1', userId: 'user-1' },
      });
    });

    it('CONCURRENCIA: el segundo escaneo del mismo boleto ve valid:false (no ambos ganan)', async () => {
      prisma.ticket.updateMany.mockResolvedValue({ count: 0 }); // ya lo marcó otro escaneo
      const scannedAt = new Date();
      prisma.ticket.findUnique.mockResolvedValue({
        id: 'ticket-1',
        scannedAt,
      });

      const result = await service.validateScan('ticket-1');

      expect(result).toEqual({
        valid: false,
        reason: 'Este boleto ya fue usado',
        scannedAt,
      });
    });

    it('lanza NotFoundException si el boleto no existe', async () => {
      prisma.ticket.updateMany.mockResolvedValue({ count: 0 });
      prisma.ticket.findUnique.mockResolvedValue(null);

      await expect(service.validateScan('no-existe')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('peek', () => {
    it('resuelve el eventId del boleto SIN marcarlo como usado', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        id: 'ticket-1',
        zoneId: 'zone-1',
        userId: 'user-1',
        scannedAt: null,
      });
      prisma.eventZone.findUnique.mockResolvedValue({ id: 'zone-1', eventId: 'event-1' });

      const result = await service.peek('ticket-1');

      expect(result).toEqual({
        id: 'ticket-1',
        zoneId: 'zone-1',
        eventId: 'event-1',
        userId: 'user-1',
        scannedAt: null,
      });
      expect(prisma.ticket.updateMany).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el boleto no existe', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null);

      await expect(service.peek('no-existe')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza NotFoundException si la zona del boleto no está sincronizada', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ id: 'ticket-1', zoneId: 'zone-huerfana', scannedAt: null });
      prisma.eventZone.findUnique.mockResolvedValue(null);

      await expect(service.peek('ticket-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('soldCountByZone', () => {
    it('agrupa boletos vendidos por zona', async () => {
      prisma.ticket.groupBy.mockResolvedValue([
        { zoneId: 'zone-1', _count: { _all: 20 } },
        { zoneId: 'zone-2', _count: { _all: 3 } },
      ]);

      const result = await service.soldCountByZone(['zone-1', 'zone-2']);

      expect(result).toEqual([
        { zoneId: 'zone-1', sold: 20 },
        { zoneId: 'zone-2', sold: 3 },
      ]);
    });

    it('devuelve [] sin consultar la base si no hay zoneIds', async () => {
      const result = await service.soldCountByZone([]);

      expect(result).toEqual([]);
      expect(prisma.ticket.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('salesByDay', () => {
    it('agrupa boletos vendidos por zona y día, con day como string YYYY-MM-DD', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { zoneId: 'zone-1', day: new Date('2026-09-20T00:00:00Z'), count: 3n },
        { zoneId: 'zone-1', day: new Date('2026-09-21T00:00:00Z'), count: 2n },
      ]);

      const result = await service.salesByDay(['zone-1']);

      expect(result).toEqual([
        { zoneId: 'zone-1', day: '2026-09-20', count: 3 },
        { zoneId: 'zone-1', day: '2026-09-21', count: 2 },
      ]);
    });

    it('devuelve [] sin consultar la base si no hay zoneIds', async () => {
      const result = await service.salesByDay([]);

      expect(result).toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
