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
  };

  beforeEach(async () => {
    prisma = {
      venue: {
        create: jest.fn(),
        findMany: jest.fn(),
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
});
