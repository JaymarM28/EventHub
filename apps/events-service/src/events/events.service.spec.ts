import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InternalUserContext } from '@event-hub/internal-auth';
import { EventsService } from './events.service';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventsPublisher } from '../messaging/domain-events.publisher';
import { AuthClientService } from './auth-client.service';
import { TicketsClientService } from './tickets-client.service';
import { GeocodingService } from './geocoding.service';

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
    zone: {
      create: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
    };
    discountCode: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let publisher: { publish: jest.Mock };
  let authClient: { createStaffUser: jest.Mock };
  let ticketsClient: { soldCountByZone: jest.Mock };
  let geocoding: { geocode: jest.Mock };

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
      zone: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      discountCode: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((fn) => fn(prisma)),
      $queryRaw: jest.fn(),
    };
    publisher = { publish: jest.fn().mockResolvedValue(undefined) };
    authClient = { createStaffUser: jest.fn() };
    ticketsClient = { soldCountByZone: jest.fn().mockResolvedValue([]) };
    geocoding = { geocode: jest.fn().mockResolvedValue(null) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: prisma },
        { provide: DomainEventsPublisher, useValue: publisher },
        { provide: AuthClientService, useValue: authClient },
        { provide: TicketsClientService, useValue: ticketsClient },
        { provide: GeocodingService, useValue: geocoding },
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
          city: 'Bogotá',
          category: 'MUSICA',
          startsAt: new Date().toISOString(),
          zones: [{ name: 'General', price: 50, capacity: 100 }],
        },
        organizer.userId,
      );

      expect(result).toBe(created);
      expect(publisher.publish).toHaveBeenCalledWith('event.created', created);
    });
  });

  describe('findAll', () => {
    it('sin filtros, lista todo (mismo comportamiento que antes de Fase C)', async () => {
      prisma.event.findMany.mockResolvedValue([]);

      await service.findAll();

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: {},
        include: { zones: true },
        orderBy: { startsAt: 'asc' },
      });
    });

    it('combina ciudad (case-insensitive), categoría, rango de fechas y precio máximo', async () => {
      prisma.event.findMany.mockResolvedValue([]);

      await service.findAll({
        city: 'Bogotá',
        category: 'MUSICA',
        fromDate: '2026-01-01',
        toDate: '2026-12-31',
        maxPrice: 50,
      });

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: {
          city: { equals: 'Bogotá', mode: 'insensitive' },
          category: 'MUSICA',
          startsAt: { gte: new Date('2026-01-01'), lte: new Date('2026-12-31') },
          zones: { some: { price: { lte: 50 } } },
        },
        include: { zones: true },
        orderBy: { startsAt: 'asc' },
      });
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

  describe('addZone', () => {
    it('crea la zona y publica event.updated con el evento completo', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'ev-1', organizerId: organizer.userId, zones: [] });
      prisma.zone.create.mockResolvedValue({ id: 'zone-new' });

      await service.addZone('ev-1', { name: 'VIP', price: 100, capacity: 20 }, organizer);

      expect(prisma.zone.create).toHaveBeenCalledWith({
        data: { eventId: 'ev-1', name: 'VIP', price: 100, capacity: 20 },
      });
      expect(publisher.publish).toHaveBeenCalledWith('event.updated', expect.objectContaining({ id: 'ev-1' }));
    });

    it('rechaza a quien no es dueño del evento', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'ev-1', organizerId: organizer.userId, zones: [] });

      await expect(
        service.addZone('ev-1', { name: 'VIP', price: 100, capacity: 20 }, otherOrganizer),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.zone.create).not.toHaveBeenCalled();
    });
  });

  describe('updateZone', () => {
    const existingWithZone = {
      id: 'ev-1',
      organizerId: organizer.userId,
      zones: [{ id: 'zone-1', name: 'General', price: 50, capacity: 100 }],
    };

    it('permite subir la capacidad libremente', async () => {
      prisma.event.findUnique.mockResolvedValue(existingWithZone);
      ticketsClient.soldCountByZone.mockResolvedValue([{ zoneId: 'zone-1', sold: 80 }]);

      await service.updateZone('ev-1', 'zone-1', { capacity: 150 }, organizer);

      expect(prisma.zone.update).toHaveBeenCalledWith({
        where: { id: 'zone-1' },
        data: { capacity: 150 },
      });
    });

    it('GARANTÍA: rechaza bajar la capacidad por debajo de lo ya vendido', async () => {
      prisma.event.findUnique.mockResolvedValue(existingWithZone);
      ticketsClient.soldCountByZone.mockResolvedValue([{ zoneId: 'zone-1', sold: 80 }]);

      await expect(service.updateZone('ev-1', 'zone-1', { capacity: 50 }, organizer)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.zone.update).not.toHaveBeenCalled();
    });

    it('permite editar nombre/precio sin consultar vendidos', async () => {
      prisma.event.findUnique.mockResolvedValue(existingWithZone);

      await service.updateZone('ev-1', 'zone-1', { name: 'General renombrada', price: 60 }, organizer);

      expect(ticketsClient.soldCountByZone).not.toHaveBeenCalled();
      expect(prisma.zone.update).toHaveBeenCalledWith({
        where: { id: 'zone-1' },
        data: { name: 'General renombrada', price: 60 },
      });
    });

    it('lanza NotFoundException si la zona no pertenece a este evento', async () => {
      prisma.event.findUnique.mockResolvedValue(existingWithZone);

      await expect(service.updateZone('ev-1', 'zone-inexistente', { price: 10 }, organizer)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rechaza a quien no es dueño del evento', async () => {
      prisma.event.findUnique.mockResolvedValue(existingWithZone);

      await expect(
        service.updateZone('ev-1', 'zone-1', { price: 10 }, otherOrganizer),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.zone.update).not.toHaveBeenCalled();
    });
  });

  describe('findZoneWithOrganizer', () => {
    it('resuelve eventId/organizerId y los datos para el correo de confirmación a partir de una zona (usado por notifications-service)', async () => {
      prisma.zone.findUnique.mockResolvedValue({
        id: 'zone-1',
        name: 'General',
        price: { toString: () => '50000' },
        event: {
          id: 'ev-1',
          title: 'Concierto',
          organizerId: 'organizer-1',
          venue: 'Estadio',
          city: 'Bogotá',
          startsAt: new Date('2027-01-01T20:00:00.000Z'),
          currency: 'COP',
        },
      });

      const result = await service.findZoneWithOrganizer('zone-1');

      expect(prisma.zone.findUnique).toHaveBeenCalledWith({
        where: { id: 'zone-1' },
        include: {
          event: {
            select: { id: true, title: true, organizerId: true, venue: true, city: true, startsAt: true, currency: true },
          },
        },
      });
      expect(result).toEqual({
        eventId: 'ev-1',
        eventTitle: 'Concierto',
        organizerId: 'organizer-1',
        venue: 'Estadio',
        city: 'Bogotá',
        startsAt: new Date('2027-01-01T20:00:00.000Z'),
        currency: 'COP',
        zoneName: 'General',
        zonePrice: '50000',
      });
    });

    it('lanza NotFoundException si la zona no existe', async () => {
      prisma.zone.findUnique.mockResolvedValue(null);

      await expect(service.findZoneWithOrganizer('no-existe')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createDiscountCode', () => {
    const event = { id: 'ev-1', organizerId: organizer.userId, zones: [] };

    it('crea el código en mayúsculas', async () => {
      prisma.event.findUnique.mockResolvedValue(event);
      prisma.discountCode.findUnique.mockResolvedValue(null);
      prisma.discountCode.create.mockResolvedValue({ id: 'code-1' });

      await service.createDiscountCode('ev-1', { code: 'amigos20', type: 'PERCENTAGE', value: 20 }, organizer);

      expect(prisma.discountCode.create).toHaveBeenCalledWith({
        data: { eventId: 'ev-1', code: 'AMIGOS20', type: 'PERCENTAGE', value: 20, maxUses: undefined },
      });
    });

    it('rechaza un porcentaje fuera de 0-100', async () => {
      prisma.event.findUnique.mockResolvedValue(event);

      await expect(
        service.createDiscountCode('ev-1', { code: 'X', type: 'PERCENTAGE', value: 150 }, organizer),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza un código duplicado en el mismo evento', async () => {
      prisma.event.findUnique.mockResolvedValue(event);
      prisma.discountCode.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createDiscountCode('ev-1', { code: 'AMIGOS20', type: 'PERCENTAGE', value: 20 }, organizer),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza a un organizador que no es dueño del evento', async () => {
      prisma.event.findUnique.mockResolvedValue(event);

      await expect(
        service.createDiscountCode('ev-1', { code: 'X', type: 'FIXED', value: 10 }, otherOrganizer),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('redeemDiscountCode', () => {
    it('GARANTÍA: canjea atómicamente e incrementa usedCount', async () => {
      prisma.zone.findUnique.mockResolvedValue({ eventId: 'ev-1', price: { toString: () => '50000' } });
      prisma.$queryRaw.mockResolvedValue([
        { id: 'code-1', type: 'PERCENTAGE', value: { toString: () => '20' }, maxUses: 5, usedCount: 2, active: true },
      ]);

      const result = await service.redeemDiscountCode('zone-1', 'amigos20');

      expect(prisma.discountCode.update).toHaveBeenCalledWith({
        where: { id: 'code-1' },
        data: { usedCount: { increment: 1 } },
      });
      expect(result).toEqual({ type: 'PERCENTAGE', value: '20', zonePrice: '50000' });
    });

    it('rechaza un código inexistente o inactivo', async () => {
      prisma.zone.findUnique.mockResolvedValue({ eventId: 'ev-1', price: { toString: () => '50000' } });
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(service.redeemDiscountCode('zone-1', 'NOEXISTE')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.discountCode.update).not.toHaveBeenCalled();
    });

    it('GARANTÍA: rechaza un código que ya alcanzó su límite de usos', async () => {
      prisma.zone.findUnique.mockResolvedValue({ eventId: 'ev-1', price: { toString: () => '50000' } });
      prisma.$queryRaw.mockResolvedValue([
        { id: 'code-1', type: 'FIXED', value: { toString: () => '5000' }, maxUses: 3, usedCount: 3, active: true },
      ]);

      await expect(service.redeemDiscountCode('zone-1', 'AGOTADO')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.discountCode.update).not.toHaveBeenCalled();
    });
  });
});
