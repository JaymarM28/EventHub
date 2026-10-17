import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('ReservationsService', () => {
  let service: ReservationsService;
  let prisma: {
    eventZone: { findUnique: jest.Mock };
    ticket: { count: jest.Mock; findMany: jest.Mock };
    seat: { findMany: jest.Mock };
  };
  let redis: {
    tryReserve: jest.Mock;
    getReservation: jest.Mock;
    release: jest.Mock;
    trySeatReserve: jest.Mock;
    getSeatReservation: jest.Mock;
    releaseSeats: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      eventZone: { findUnique: jest.fn() },
      ticket: { count: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      seat: { findMany: jest.fn() },
    };
    redis = {
      tryReserve: jest.fn(),
      getReservation: jest.fn(),
      release: jest.fn(),
      trySeatReserve: jest.fn(),
      getSeatReservation: jest.fn().mockResolvedValue(null),
      releaseSeats: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        {
          provide: ConfigService,
          useValue: { get: (_key: string, fallback: number) => fallback },
        },
      ],
    }).compile();

    service = moduleRef.get(ReservationsService);
  });

  it('lanza NotFoundException si la zona no existe', async () => {
    prisma.eventZone.findUnique.mockResolvedValue(null);

    await expect(service.reserve('zone-x', 'user-1', 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rechaza si ya no hay cupo según Postgres (confirmados >= capacidad)', async () => {
    prisma.eventZone.findUnique.mockResolvedValue({ id: 'zone-1', capacity: 5 });
    prisma.ticket.count.mockResolvedValue(5);

    await expect(service.reserve('zone-1', 'user-1', 1)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(redis.tryReserve).not.toHaveBeenCalled();
  });

  it('rechaza si pide más boletos de los que quedan, aunque alcance para uno solo', async () => {
    prisma.eventZone.findUnique.mockResolvedValue({ id: 'zone-1', capacity: 5 });
    prisma.ticket.count.mockResolvedValue(3); // quedan 2

    await expect(service.reserve('zone-1', 'user-1', 3)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(redis.tryReserve).not.toHaveBeenCalled();
  });

  it('GARANTÍA #11: un boleto reembolsado libera cupo real (no cuenta como confirmado)', async () => {
    prisma.eventZone.findUnique.mockResolvedValue({ id: 'zone-1', capacity: 5, price: '50', currency: 'COP' });
    prisma.ticket.count.mockResolvedValue(4); // 5 emitidos, 1 reembolsado -> el mock ya refleja el filtro
    redis.tryReserve.mockResolvedValue({ reservationId: 'res-1', expiresAt: 123 });

    await service.reserve('zone-1', 'user-1', 1);

    expect(prisma.ticket.count).toHaveBeenCalledWith({
      where: { zoneId: 'zone-1', refundedAt: null },
    });
  });

  it('reserva exitosamente cuando hay cupo y Redis acepta, incluyendo precio unitario y moneda de la zona', async () => {
    prisma.eventZone.findUnique.mockResolvedValue({ id: 'zone-1', capacity: 5, price: '50', currency: 'COP' });
    prisma.ticket.count.mockResolvedValue(2);
    redis.tryReserve.mockResolvedValue({ reservationId: 'res-1', expiresAt: 123 });

    const result = await service.reserve('zone-1', 'user-1', 3);

    expect(redis.tryReserve).toHaveBeenCalledWith('zone-1', 'user-1', 3, 3, expect.any(Number));
    expect(result).toEqual({
      reservationId: 'res-1',
      expiresAt: 123,
      zoneId: 'zone-1',
      quantity: 3,
      price: 50,
      currency: 'COP',
    });
  });

  it('rechaza si Redis dice que la zona está llena de reservas activas', async () => {
    prisma.eventZone.findUnique.mockResolvedValue({ id: 'zone-1', capacity: 5 });
    prisma.ticket.count.mockResolvedValue(1);
    redis.tryReserve.mockResolvedValue(null);

    await expect(service.reserve('zone-1', 'user-1', 1)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('release: libera el hold en Redis si existe', async () => {
    redis.getReservation.mockResolvedValue({ zoneId: 'zone-1', userId: 'u1', expiresAt: 1 });

    await service.release('res-1');

    expect(redis.release).toHaveBeenCalledWith('zone-1', 'res-1');
  });

  it('release: no hace nada si el hold ya no existe (expiró o no existía)', async () => {
    redis.getReservation.mockResolvedValue(null);

    await service.release('res-x');

    expect(redis.release).not.toHaveBeenCalled();
    expect(redis.releaseSeats).not.toHaveBeenCalled();
  });

  describe('reserveSeats', () => {
    it('lanza NotFoundException si la zona no existe', async () => {
      prisma.eventZone.findUnique.mockResolvedValue(null);

      await expect(service.reserveSeats('zone-x', 'user-1', ['seat-1'])).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lanza NotFoundException si alguna butaca no existe en esa zona', async () => {
      prisma.eventZone.findUnique.mockResolvedValue({ id: 'zone-1', price: '50', currency: 'COP' });
      prisma.seat.findMany.mockResolvedValue([{ id: 'seat-1' }]); // pidió 2, solo existe 1

      await expect(service.reserveSeats('zone-1', 'user-1', ['seat-1', 'seat-2'])).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(redis.trySeatReserve).not.toHaveBeenCalled();
    });

    it('GARANTÍA: rechaza si alguna butaca ya fue vendida (existe un Ticket con ese seatId)', async () => {
      prisma.eventZone.findUnique.mockResolvedValue({ id: 'zone-1', price: '50', currency: 'COP' });
      prisma.seat.findMany.mockResolvedValue([{ id: 'seat-1' }, { id: 'seat-2' }]);
      prisma.ticket.findMany.mockResolvedValue([{ seatId: 'seat-1' }]);

      await expect(service.reserveSeats('zone-1', 'user-1', ['seat-1', 'seat-2'])).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(redis.trySeatReserve).not.toHaveBeenCalled();
    });

    it('reserva exitosamente cuando las butacas existen, no están vendidas y Redis acepta', async () => {
      prisma.eventZone.findUnique.mockResolvedValue({ id: 'zone-1', price: '50', currency: 'COP' });
      prisma.seat.findMany.mockResolvedValue([{ id: 'seat-1' }, { id: 'seat-2' }]);
      prisma.ticket.findMany.mockResolvedValue([]);
      redis.trySeatReserve.mockResolvedValue({ reservationId: 'res-1', expiresAt: 123 });

      const result = await service.reserveSeats('zone-1', 'user-1', ['seat-1', 'seat-2']);

      expect(redis.trySeatReserve).toHaveBeenCalledWith(['seat-1', 'seat-2'], 'zone-1', 'user-1', expect.any(Number));
      expect(result).toEqual({
        reservationId: 'res-1',
        expiresAt: 123,
        zoneId: 'zone-1',
        seatIds: ['seat-1', 'seat-2'],
        quantity: 2,
        price: 50,
        currency: 'COP',
      });
    });

    it('rechaza si Redis dice que alguna butaca ya está siendo reservada por otro', async () => {
      prisma.eventZone.findUnique.mockResolvedValue({ id: 'zone-1', price: '50', currency: 'COP' });
      prisma.seat.findMany.mockResolvedValue([{ id: 'seat-1' }]);
      prisma.ticket.findMany.mockResolvedValue([]);
      redis.trySeatReserve.mockResolvedValue(null);

      await expect(service.reserveSeats('zone-1', 'user-1', ['seat-1'])).rejects.toBeInstanceOf(ConflictException);
    });

    it('release: libera butacas en Redis si el hold era de asientos', async () => {
      redis.getReservation.mockResolvedValue(null);
      redis.getSeatReservation.mockResolvedValue({
        zoneId: 'zone-1',
        userId: 'u1',
        expiresAt: 1,
        seatIds: ['seat-1', 'seat-2'],
      });

      await service.release('res-1');

      expect(redis.releaseSeats).toHaveBeenCalledWith('res-1', ['seat-1', 'seat-2']);
    });
  });
});
