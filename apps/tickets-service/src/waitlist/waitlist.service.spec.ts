import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WaitlistService } from './waitlist.service';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventsPublisher } from '../messaging/domain-events.publisher';

describe('WaitlistService', () => {
  let service: WaitlistService;
  let prisma: {
    eventZone: { findUnique: jest.Mock };
    ticket: { count: jest.Mock };
    waitlistEntry: {
      upsert: jest.Mock;
      deleteMany: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let publisher: { publish: jest.Mock };

  beforeEach(async () => {
    prisma = {
      eventZone: { findUnique: jest.fn() },
      ticket: { count: jest.fn() },
      waitlistEntry: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    publisher = { publish: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WaitlistService,
        { provide: PrismaService, useValue: prisma },
        { provide: DomainEventsPublisher, useValue: publisher },
      ],
    }).compile();

    service = moduleRef.get(WaitlistService);
  });

  describe('join', () => {
    it('rechaza si la zona no existe', async () => {
      prisma.eventZone.findUnique.mockResolvedValue(null);

      await expect(service.join('zone-1', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('GARANTÍA: rechaza anotarse si la zona todavía tiene cupo real', async () => {
      prisma.eventZone.findUnique.mockResolvedValue({ id: 'zone-1', capacity: 10 });
      prisma.ticket.count.mockResolvedValue(5); // quedan 5 cupos

      await expect(service.join('zone-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.waitlistEntry.upsert).not.toHaveBeenCalled();
    });

    it('cuenta solo boletos NO reembolsados como cupo ocupado (mismo fix que #22)', async () => {
      prisma.eventZone.findUnique.mockResolvedValue({ id: 'zone-1', capacity: 10 });
      prisma.ticket.count.mockResolvedValue(10);
      prisma.waitlistEntry.upsert.mockResolvedValue({ id: 'wl-1' });

      await service.join('zone-1', 'user-1');

      expect(prisma.ticket.count).toHaveBeenCalledWith({
        where: { zoneId: 'zone-1', refundedAt: null },
      });
    });

    it('anota a la persona (upsert por zoneId+userId) cuando la zona está realmente agotada', async () => {
      prisma.eventZone.findUnique.mockResolvedValue({ id: 'zone-1', capacity: 10 });
      prisma.ticket.count.mockResolvedValue(10);
      prisma.waitlistEntry.upsert.mockResolvedValue({ id: 'wl-1' });

      await service.join('zone-1', 'user-1');

      expect(prisma.waitlistEntry.upsert).toHaveBeenCalledWith({
        where: { zoneId_userId: { zoneId: 'zone-1', userId: 'user-1' } },
        create: { zoneId: 'zone-1', userId: 'user-1' },
        update: {},
      });
    });
  });

  describe('leave', () => {
    it('borra la fila de esa persona en esa zona', async () => {
      await service.leave('zone-1', 'user-1');

      expect(prisma.waitlistEntry.deleteMany).toHaveBeenCalledWith({
        where: { zoneId: 'zone-1', userId: 'user-1' },
      });
    });
  });

  describe('status', () => {
    it('waiting:false cuando no hay fila', async () => {
      prisma.waitlistEntry.findUnique.mockResolvedValue(null);

      await expect(service.status('zone-1', 'user-1')).resolves.toEqual({
        waiting: false,
        notified: false,
      });
    });

    it('waiting:true, notified:false mientras espera su turno', async () => {
      prisma.waitlistEntry.findUnique.mockResolvedValue({ id: 'wl-1', notifiedAt: null });

      await expect(service.status('zone-1', 'user-1')).resolves.toEqual({
        waiting: true,
        notified: false,
      });
    });

    it('notified:true después de avisarle', async () => {
      prisma.waitlistEntry.findUnique.mockResolvedValue({ id: 'wl-1', notifiedAt: new Date() });

      await expect(service.status('zone-1', 'user-1')).resolves.toEqual({
        waiting: true,
        notified: true,
      });
    });
  });

  describe('notifyFreedSlots', () => {
    it('no hace nada si no se liberó ningún cupo', async () => {
      await service.notifyFreedSlots('zone-1', 0);

      expect(prisma.waitlistEntry.findMany).not.toHaveBeenCalled();
    });

    it('FIFO: avisa a los primeros `freedCount` sin avisar todavía, en orden de createdAt', async () => {
      prisma.waitlistEntry.findMany.mockResolvedValue([
        { id: 'wl-1', userId: 'user-1' },
        { id: 'wl-2', userId: 'user-2' },
      ]);

      await service.notifyFreedSlots('zone-1', 2);

      expect(prisma.waitlistEntry.findMany).toHaveBeenCalledWith({
        where: { zoneId: 'zone-1', notifiedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 2,
      });
      expect(prisma.waitlistEntry.update).toHaveBeenCalledWith({
        where: { id: 'wl-1' },
        data: { notifiedAt: expect.any(Date) },
      });
      expect(prisma.waitlistEntry.update).toHaveBeenCalledWith({
        where: { id: 'wl-2' },
        data: { notifiedAt: expect.any(Date) },
      });
      expect(publisher.publish).toHaveBeenCalledWith('waitlist.slot-available', {
        userId: 'user-1',
        zoneId: 'zone-1',
      });
      expect(publisher.publish).toHaveBeenCalledWith('waitlist.slot-available', {
        userId: 'user-2',
        zoneId: 'zone-1',
      });
    });
  });
});
