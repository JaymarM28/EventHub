import { Test } from '@nestjs/testing';
import { ZonesService } from './zones.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ZonesService', () => {
  let service: ZonesService;
  let prisma: { eventZone: { upsert: jest.Mock } };

  beforeEach(async () => {
    prisma = { eventZone: { upsert: jest.fn().mockResolvedValue({}) } };

    const moduleRef = await Test.createTestingModule({
      providers: [ZonesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(ZonesService);
  });

  it('hace upsert de cada zona del evento', async () => {
    await service.syncFromEvent({
      id: 'event-1',
      zones: [
        { id: 'zone-1', name: 'General', price: '50', capacity: 100 },
        { id: 'zone-2', name: 'VIP', price: 150, capacity: 20 },
      ],
    });

    expect(prisma.eventZone.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.eventZone.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'zone-1' },
        create: expect.objectContaining({ eventId: 'event-1', name: 'General' }),
      }),
    );
  });
});
