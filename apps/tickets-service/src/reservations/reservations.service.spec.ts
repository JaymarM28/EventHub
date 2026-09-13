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
    ticket: { count: jest.Mock };
  };
  let redis: { tryReserve: jest.Mock; getReservation: jest.Mock; release: jest.Mock };

  beforeEach(async () => {
    prisma = {
      eventZone: { findUnique: jest.fn() },
      ticket: { count: jest.fn() },
    };
    redis = {
      tryReserve: jest.fn(),
      getReservation: jest.fn(),
      release: jest.fn(),
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

    await expect(service.reserve('zone-x', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rechaza si ya no hay cupo según Postgres (confirmados >= capacidad)', async () => {
    prisma.eventZone.findUnique.mockResolvedValue({ id: 'zone-1', capacity: 5 });
    prisma.ticket.count.mockResolvedValue(5);

    await expect(service.reserve('zone-1', 'user-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(redis.tryReserve).not.toHaveBeenCalled();
  });

  it('reserva exitosamente cuando hay cupo y Redis acepta, incluyendo el precio de la zona', async () => {
    prisma.eventZone.findUnique.mockResolvedValue({ id: 'zone-1', capacity: 5, price: '50' });
    prisma.ticket.count.mockResolvedValue(2);
    redis.tryReserve.mockResolvedValue({ reservationId: 'res-1', expiresAt: 123 });

    const result = await service.reserve('zone-1', 'user-1');

    expect(redis.tryReserve).toHaveBeenCalledWith('zone-1', 'user-1', 3, expect.any(Number));
    expect(result).toEqual({ reservationId: 'res-1', expiresAt: 123, zoneId: 'zone-1', price: 50 });
  });

  it('rechaza si Redis dice que la zona está llena de reservas activas', async () => {
    prisma.eventZone.findUnique.mockResolvedValue({ id: 'zone-1', capacity: 5 });
    prisma.ticket.count.mockResolvedValue(1);
    redis.tryReserve.mockResolvedValue(null);

    await expect(service.reserve('zone-1', 'user-1')).rejects.toBeInstanceOf(
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
  });
});
