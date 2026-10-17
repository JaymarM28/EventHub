import { Test } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersClientService } from './users-client.service';
import { EmailService } from './email.service';
import { PushService } from './push.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    processedEvent: { findUnique: jest.Mock; create: jest.Mock };
    notification: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let usersClient: { findById: jest.Mock };
  let emailService: { send: jest.Mock };
  let pushService: { sendToUser: jest.Mock };

  beforeEach(async () => {
    prisma = {
      processedEvent: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({}) },
      notification: { create: jest.fn() },
      $transaction: jest.fn(async (ops) => Promise.all(ops)),
    };
    usersClient = { findById: jest.fn().mockResolvedValue({ id: 'user-1', email: 'user1@example.com' }) };
    emailService = { send: jest.fn().mockResolvedValue(undefined) };
    pushService = { sendToUser: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersClientService, useValue: usersClient },
        { provide: EmailService, useValue: emailService },
        { provide: PushService, useValue: pushService },
      ],
    }).compile();

    service = moduleRef.get(NotificationsService);
  });

  it('no reprocesa un eventId ya visto (idempotencia)', async () => {
    prisma.processedEvent.findUnique.mockResolvedValue({ eventId: 'ev-1' });

    await service.notify('ev-1', 'order.paid', 'user-1', 'asunto', 'cuerpo');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('resuelve el email del usuario, envía el correo real y luego marca el evento procesado', async () => {
    prisma.processedEvent.findUnique.mockResolvedValue(null);
    prisma.notification.create.mockResolvedValue({});

    await service.notify('ev-2', 'ticket.issued', 'user-1', 'Tu boleto está listo', 'cuerpo');

    expect(usersClient.findById).toHaveBeenCalledWith('user-1');
    expect(emailService.send).toHaveBeenCalledWith(
      'user1@example.com',
      'Tu boleto está listo',
      expect.stringContaining('Tu boleto está listo'),
    );
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          subject: 'Tu boleto está listo',
        }),
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Sin `pushBody` explícito, cae al subject (ver NotificationsService.notify).
    expect(pushService.sendToUser).toHaveBeenCalledWith('user-1', 'Tu boleto está listo', 'Tu boleto está listo');
  });

  it('si el push falla (ej. token vencido), NO bloquea el email ni la idempotencia', async () => {
    prisma.processedEvent.findUnique.mockResolvedValue(null);
    pushService.sendToUser.mockRejectedValue(new Error('messaging/registration-token-not-registered'));

    await service.notify('ev-push-fail', 'order.paid', 'user-1', 'asunto', 'cuerpo');

    expect(emailService.send).toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('si el envío de email falla, NO marca el evento como procesado (debe poder reintentarse)', async () => {
    prisma.processedEvent.findUnique.mockResolvedValue(null);
    emailService.send.mockRejectedValue(new Error('Resend rechazó el envío'));

    await expect(service.notify('ev-3', 'order.paid', 'user-1', 'asunto', 'cuerpo')).rejects.toThrow(
      'Resend rechazó el envío',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
