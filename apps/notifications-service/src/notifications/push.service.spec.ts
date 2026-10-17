import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PushService } from './push.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PushService', () => {
  let service: PushService;
  let prisma: {
    deviceToken: { upsert: jest.Mock; findMany: jest.Mock; deleteMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      deviceToken: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: PrismaService, useValue: prisma },
        // Sin credenciales de Firebase configuradas (mismo estado que un
        // entorno de desarrollo recién clonado) — ver el warning en el
        // constructor de PushService.
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();

    service = moduleRef.get(PushService);
  });

  it('registerToken: upsert por token (no por userId) — un mismo token nunca duplica fila', async () => {
    prisma.deviceToken.upsert.mockResolvedValue({ id: 'dt-1' });

    await service.registerToken('user-1', 'token-abc', 'ios');

    expect(prisma.deviceToken.upsert).toHaveBeenCalledWith({
      where: { token: 'token-abc' },
      create: { userId: 'user-1', token: 'token-abc', platform: 'ios' },
      update: { userId: 'user-1', platform: 'ios' },
    });
  });

  it('sendToUser: sin Firebase configurado, no revienta — simplemente no manda nada', async () => {
    await expect(service.sendToUser('user-1', 'título', 'cuerpo')).resolves.toBeUndefined();
    expect(prisma.deviceToken.findMany).not.toHaveBeenCalled();
  });
});
