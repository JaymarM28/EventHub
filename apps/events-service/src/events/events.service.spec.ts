import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { InternalUserContext } from '@event-hub/internal-auth';
import { EventsService } from './events.service';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventsPublisher } from '../messaging/domain-events.publisher';

describe('EventsService', () => {
  let service: EventsService;
  let prisma: {
    event: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let publisher: { publish: jest.Mock };

  const organizer: InternalUserContext = {
    userId: 'organizer-1',
    email: 'org@b.com',
    roles: ['ORGANIZER'],
    validatedAt: Date.now(),
  };
  const otherOrganizer: InternalUserContext = {
    ...organizer,
    userId: 'organizer-2',
  };
  const superAdmin: InternalUserContext = {
    userId: 'admin-1',
    email: 'admin@b.com',
    roles: ['SUPER_ADMIN'],
    validatedAt: Date.now(),
  };

  beforeEach(async () => {
    prisma = {
      event: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    publisher = { publish: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: prisma },
        { provide: DomainEventsPublisher, useValue: publisher },
      ],
    }).compile();

    service = moduleRef.get(EventsService);
  });

  describe('create', () => {
    it('crea el evento y publica event.created', async () => {
      const created = { id: 'ev-1', organizerId: organizer.userId, zones: [] };
      prisma.event.create.mockResolvedValue(created);

      const result = await service.create(
        {
          title: 'Concierto',
          venue: 'Estadio',
          startsAt: new Date().toISOString(),
          zones: [{ name: 'General', price: 50, capacity: 100 }],
        },
        organizer.userId,
      );

      expect(result).toBe(created);
      expect(publisher.publish).toHaveBeenCalledWith('event.created', created);
    });
  });

  describe('findOne', () => {
    it('lanza NotFoundException si el evento no existe', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.findOne('no-existe')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('permite al organizador dueño actualizar su evento', async () => {
      const existing = { id: 'ev-1', organizerId: organizer.userId };
      prisma.event.findUnique.mockResolvedValue(existing);
      const updated = { ...existing, title: 'Nuevo título' };
      prisma.event.update.mockResolvedValue(updated);

      const result = await service.update(
        'ev-1',
        { title: 'Nuevo título' },
        organizer,
      );

      expect(result).toBe(updated);
      expect(publisher.publish).toHaveBeenCalledWith('event.updated', updated);
    });

    it('rechaza a un organizador que no es dueño del evento', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'ev-1',
        organizerId: organizer.userId,
      });

      await expect(
        service.update('ev-1', { title: 'Hackeado' }, otherOrganizer),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('permite a un SUPER_ADMIN actualizar cualquier evento', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'ev-1',
        organizerId: organizer.userId,
      });
      prisma.event.update.mockResolvedValue({ id: 'ev-1' });

      await expect(
        service.update('ev-1', { title: 'Corrección admin' }, superAdmin),
      ).resolves.toBeDefined();
    });

    it('lanza NotFoundException si el evento a actualizar no existe', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(
        service.update('no-existe', { title: 'x' }, organizer),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
