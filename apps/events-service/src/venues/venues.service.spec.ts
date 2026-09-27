import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { VenuesService } from './venues.service';
import { PrismaService } from '../prisma/prisma.service';

describe('VenuesService', () => {
  let service: VenuesService;
  let prisma: {
    venue: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    venueSection: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      venue: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      venueSection: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [VenuesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(VenuesService);
  });

  it('crea un establecimiento', async () => {
    prisma.venue.create.mockResolvedValue({ id: 'venue-1', name: 'Teatro Norte', address: 'Calle 1' });

    const result = await service.create({ name: 'Teatro Norte', address: 'Calle 1' });

    expect(prisma.venue.create).toHaveBeenCalledWith({ data: { name: 'Teatro Norte', address: 'Calle 1' } });
    expect(result).toEqual(expect.objectContaining({ id: 'venue-1' }));
  });

  it('lista establecimientos ordenados por nombre', async () => {
    prisma.venue.findMany.mockResolvedValue([{ id: 'venue-1' }]);

    const result = await service.findAll();

    expect(prisma.venue.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
    expect(result).toEqual([{ id: 'venue-1' }]);
  });

  describe('findOne', () => {
    it('devuelve el establecimiento si existe', async () => {
      prisma.venue.findUnique.mockResolvedValue({ id: 'venue-1' });

      const result = await service.findOne('venue-1');

      expect(result).toEqual({ id: 'venue-1' });
    });

    it('lanza NotFoundException si no existe', async () => {
      prisma.venue.findUnique.mockResolvedValue(null);

      await expect(service.findOne('no-existe')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('actualiza los campos dados', async () => {
      prisma.venue.findUnique.mockResolvedValue({ id: 'venue-1' });
      prisma.venue.update.mockResolvedValue({ id: 'venue-1', name: 'Nuevo nombre' });

      const result = await service.update('venue-1', { name: 'Nuevo nombre' });

      expect(prisma.venue.update).toHaveBeenCalledWith({ where: { id: 'venue-1' }, data: { name: 'Nuevo nombre' } });
      expect(result).toEqual(expect.objectContaining({ name: 'Nuevo nombre' }));
    });

    it('lanza NotFoundException si el establecimiento no existe', async () => {
      prisma.venue.findUnique.mockResolvedValue(null);

      await expect(service.update('no-existe', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.venue.update).not.toHaveBeenCalled();
    });
  });

  describe('createSection', () => {
    it('crea la sección con sus puntos', async () => {
      prisma.venue.findUnique.mockResolvedValue({ id: 'venue-1' });
      const points = [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ];
      prisma.venueSection.create.mockResolvedValue({ id: 'sec-1', venueId: 'venue-1', name: 'Platea', points });

      const result = await service.createSection('venue-1', { name: 'Platea', points });

      expect(prisma.venueSection.create).toHaveBeenCalledWith({
        data: { venueId: 'venue-1', name: 'Platea', points },
      });
      expect(result).toEqual(expect.objectContaining({ id: 'sec-1' }));
    });

    it('lanza NotFoundException si el establecimiento no existe', async () => {
      prisma.venue.findUnique.mockResolvedValue(null);

      await expect(
        service.createSection('no-existe', { name: 'Platea', points: [{ x: 0, y: 0 }] as never }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.venueSection.create).not.toHaveBeenCalled();
    });
  });

  describe('updateSection', () => {
    it('actualiza nombre y puntos', async () => {
      prisma.venueSection.findUnique.mockResolvedValue({ id: 'sec-1', venueId: 'venue-1' });
      prisma.venueSection.update.mockResolvedValue({ id: 'sec-1', name: 'Palco VIP' });

      const result = await service.updateSection('venue-1', 'sec-1', { name: 'Palco VIP' });

      expect(prisma.venueSection.update).toHaveBeenCalledWith({
        where: { id: 'sec-1' },
        data: { name: 'Palco VIP' },
      });
      expect(result).toEqual(expect.objectContaining({ name: 'Palco VIP' }));
    });

    it('lanza NotFoundException si la sección no pertenece a ese venue', async () => {
      prisma.venueSection.findUnique.mockResolvedValue({ id: 'sec-1', venueId: 'otro-venue' });

      await expect(service.updateSection('venue-1', 'sec-1', { name: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.venueSection.update).not.toHaveBeenCalled();
    });
  });
});
