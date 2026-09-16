import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { InternalUserContext } from '@event-hub/internal-auth';
import { EventsService } from './events.service';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventsPublisher } from '../messaging/domain-events.publisher';
import { AuthClientService } from './auth-client.service';
import { TicketsClientService } from './tickets-client.service';

const headers = { 'x-internal-context': 'p', 'x-internal-signature': 's' };

describe('EventsService', () => {
  let service: EventsService;
  let prisma: {
    event: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    eventStaff: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let publisher: { publish: jest.Mock };
  let authClient: { createStaffUser: jest.Mock };
  let ticketsClient: { soldCountByZone: jest.Mock };

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
      eventStaff: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };
    publisher = { publish: jest.fn().mockResolvedValue(undefined) };
    authClient = { createStaffUser: jest.fn() };
    ticketsClient = { soldCountByZone: jest.fn().mockResolvedValue([]) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: prisma },
        { provide: DomainEventsPublisher, useValue: publisher },
        { provide: AuthClientService, useValue: authClient },
        { provide: TicketsClientService, useValue: ticketsClient },
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

  describe('addStaff', () => {
    const staffDto = {
      email: 'staff@b.com',
      password: 'password123',
      firstName: 'Luis',
      lastName: 'Portero',
      birthDate: '1995-01-01',
    };

    it('crea la cuenta en auth-service, guarda EventStaff (con email denormalizado), y publica event.staff-assigned', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'ev-1', organizerId: organizer.userId });
      authClient.createStaffUser.mockResolvedValue({ id: 'user-staff-1', email: staffDto.email });
      prisma.eventStaff.create.mockResolvedValue({ id: 'es-1', eventId: 'ev-1', userId: 'user-staff-1', email: staffDto.email });

      const result = await service.addStaff('ev-1', staffDto, organizer, headers);

      expect(authClient.createStaffUser).toHaveBeenCalledWith(staffDto, headers);
      expect(prisma.eventStaff.create).toHaveBeenCalledWith({
        data: { eventId: 'ev-1', userId: 'user-staff-1', email: staffDto.email },
      });
      expect(publisher.publish).toHaveBeenCalledWith('event.staff-assigned', {
        eventId: 'ev-1',
        userId: 'user-staff-1',
      });
      expect(result).toMatchObject({ eventId: 'ev-1', userId: 'user-staff-1' });
    });

    it('rechaza a un organizador que no es dueño del evento — nunca llega a crear la cuenta', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'ev-1', organizerId: organizer.userId });

      await expect(
        service.addStaff('ev-1', staffDto, otherOrganizer, headers),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(authClient.createStaffUser).not.toHaveBeenCalled();
    });

    it('permite a un SUPER_ADMIN agregar staff a cualquier evento', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'ev-1', organizerId: organizer.userId });
      authClient.createStaffUser.mockResolvedValue({ id: 'user-staff-1', email: staffDto.email });
      prisma.eventStaff.create.mockResolvedValue({ id: 'es-1' });

      await expect(
        service.addStaff('ev-1', staffDto, superAdmin, headers),
      ).resolves.toBeDefined();
    });
  });

  describe('findByOrganizer', () => {
    it('filtra eventos por organizerId', async () => {
      prisma.event.findMany.mockResolvedValue([{ id: 'ev-1', organizerId: organizer.userId }]);

      const result = await service.findByOrganizer(organizer.userId);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizerId: organizer.userId } }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('listStaff', () => {
    it('rechaza a quien no es dueño del evento', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'ev-1', organizerId: organizer.userId, zones: [] });

      await expect(service.listStaff('ev-1', otherOrganizer)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('devuelve el staff del evento al dueño', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'ev-1', organizerId: organizer.userId, zones: [] });
      prisma.eventStaff.findMany.mockResolvedValue([{ id: 'es-1', userId: 'u-1', email: 'a@b.com' }]);

      const result = await service.listStaff('ev-1', organizer);

      expect(result).toHaveLength(1);
    });
  });

  describe('dashboard', () => {
    it('combina capacidad (propia) con vendidos (tickets-service) por zona', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'ev-1',
        organizerId: organizer.userId,
        zones: [
          { id: 'zone-1', name: 'General', price: 100, capacity: 50 },
          { id: 'zone-2', name: 'VIP', price: 200, capacity: 10 },
        ],
      });
      ticketsClient.soldCountByZone.mockResolvedValue([{ zoneId: 'zone-1', sold: 20 }]);

      const result = await service.dashboard('ev-1', organizer);

      expect(ticketsClient.soldCountByZone).toHaveBeenCalledWith(['zone-1', 'zone-2']);
      expect(result.zones).toEqual([
        { zoneId: 'zone-1', name: 'General', price: 100, capacity: 50, sold: 20, revenue: 2000 },
        { zoneId: 'zone-2', name: 'VIP', price: 200, capacity: 10, sold: 0, revenue: 0 },
      ]);
      expect(result.totalCapacity).toBe(60);
      expect(result.totalSold).toBe(20);
      expect(result.totalRevenue).toBe(2000);
    });

    it('rechaza a quien no es dueño del evento', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'ev-1', organizerId: organizer.userId, zones: [] });

      await expect(service.dashboard('ev-1', otherOrganizer)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
