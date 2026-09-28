import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { signTicketToken } from '@event-hub/shared-types';
import { InternalUserContext } from '@event-hub/internal-auth';
import { ScansService } from './scans.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventAccessService } from '../event-access/event-access.service';
import { TicketsClientService, TicketsServiceUnavailableError } from './tickets-client.service';

const QR_SECRET = 'test-qr-secret';
const headers = { 'x-internal-context': 'p', 'x-internal-signature': 's' };

const staffUser: InternalUserContext = {
  userId: 'staff-1',
  email: 'staff@example.com',
  roles: ['STAFF'],
  validatedAt: Date.now(),
};

const superAdminUser: InternalUserContext = {
  userId: 'admin-1',
  email: 'admin@example.com',
  roles: ['SUPER_ADMIN'],
  validatedAt: Date.now(),
};

describe('ScansService', () => {
  let service: ScansService;
  let prisma: { scanLog: { create: jest.Mock } };
  let ticketsClient: { peek: jest.Mock; validate: jest.Mock };
  let eventAccess: { isAuthorized: jest.Mock };

  beforeEach(async () => {
    prisma = { scanLog: { create: jest.fn().mockResolvedValue({}) } };
    ticketsClient = { peek: jest.fn(), validate: jest.fn() };
    eventAccess = { isAuthorized: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ScansService,
        { provide: PrismaService, useValue: prisma },
        { provide: TicketsClientService, useValue: ticketsClient },
        { provide: EventAccessService, useValue: eventAccess },
        { provide: ConfigService, useValue: { getOrThrow: () => QR_SECRET } },
      ],
    }).compile();

    service = moduleRef.get(ScansService);
  });

  it('VALID: boleto genuino, no usado, y escaneador autorizado para ese evento', async () => {
    const token = signTicketToken('ticket-1', QR_SECRET);
    ticketsClient.peek.mockResolvedValue({ id: 'ticket-1', zoneId: 'zone-1', eventId: 'event-1', userId: 'user-1', scannedAt: null });
    eventAccess.isAuthorized.mockResolvedValue(true);
    ticketsClient.validate.mockResolvedValue({
      valid: true,
      ticket: { id: 'ticket-1', zoneId: 'zone-1', userId: 'user-1' },
    });

    const result = await service.scan(token, staffUser, headers);

    expect(result).toEqual({
      status: 'VALID',
      ticket: { id: 'ticket-1', zoneId: 'zone-1', userId: 'user-1' },
    });
    expect(eventAccess.isAuthorized).toHaveBeenCalledWith('event-1', 'staff-1');
    expect(prisma.scanLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ result: 'VALID', ticketId: 'ticket-1' }) }),
    );
  });

  it('ALREADY_USED: boleto genuino pero ya escaneado antes', async () => {
    const token = signTicketToken('ticket-1', QR_SECRET);
    ticketsClient.peek.mockResolvedValue({ id: 'ticket-1', zoneId: 'zone-1', eventId: 'event-1', userId: 'user-1', scannedAt: null });
    eventAccess.isAuthorized.mockResolvedValue(true);
    ticketsClient.validate.mockResolvedValue({
      valid: false,
      reason: 'Este boleto ya fue usado',
      scannedAt: '2026-01-01T00:00:00.000Z',
    });

    const result = await service.scan(token, staffUser, headers);

    expect(result.status).toBe('ALREADY_USED');
  });

  it('#22 REFUNDED: boleto genuino pero de una orden reembolsada', async () => {
    const token = signTicketToken('ticket-1', QR_SECRET);
    ticketsClient.peek.mockResolvedValue({ id: 'ticket-1', zoneId: 'zone-1', eventId: 'event-1', userId: 'user-1', scannedAt: null });
    eventAccess.isAuthorized.mockResolvedValue(true);
    ticketsClient.validate.mockResolvedValue({
      valid: false,
      reason: 'Este boleto fue reembolsado',
      scannedAt: null,
      refunded: true,
    });

    const result = await service.scan(token, staffUser, headers);

    expect(result).toEqual({ status: 'REFUNDED', message: 'Este boleto fue reembolsado' });
    expect(prisma.scanLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ result: 'REFUNDED' }) }),
    );
  });

  it('INVALID: QR con firma alterada — ni siquiera llama a tickets-service', async () => {
    const result = await service.scan('ticket-1.firma-falsa', staffUser, headers);

    expect(result.status).toBe('INVALID');
    expect(ticketsClient.peek).not.toHaveBeenCalled();
  });

  it('INVALID: boleto con firma válida pero que no existe en tickets-service', async () => {
    const token = signTicketToken('no-existe', QR_SECRET);
    ticketsClient.peek.mockRejectedValue(new NotFoundException());

    const result = await service.scan(token, staffUser, headers);

    expect(result.status).toBe('INVALID');
  });

  it('DEGRADED: tickets-service no responde al resolver el evento del boleto', async () => {
    const token = signTicketToken('ticket-1', QR_SECRET);
    ticketsClient.peek.mockRejectedValue(new TicketsServiceUnavailableError());

    const result = await service.scan(token, staffUser, headers);

    expect(result.status).toBe('DEGRADED');
    if (result.status === 'DEGRADED') {
      expect(result.message).toMatch(/validar manualmente/);
    }
  });

  it('DEGRADED: tickets-service no responde al validar (ya autorizado)', async () => {
    const token = signTicketToken('ticket-1', QR_SECRET);
    ticketsClient.peek.mockResolvedValue({ id: 'ticket-1', zoneId: 'zone-1', eventId: 'event-1', userId: 'user-1', scannedAt: null });
    eventAccess.isAuthorized.mockResolvedValue(true);
    ticketsClient.validate.mockRejectedValue(new TicketsServiceUnavailableError());

    const result = await service.scan(token, staffUser, headers);

    expect(result.status).toBe('DEGRADED');
  });

  it('FORBIDDEN: el escaneador no está autorizado para el evento del boleto — nunca llega a consumirlo', async () => {
    const token = signTicketToken('ticket-1', QR_SECRET);
    ticketsClient.peek.mockResolvedValue({ id: 'ticket-1', zoneId: 'zone-1', eventId: 'event-1', userId: 'user-1', scannedAt: null });
    eventAccess.isAuthorized.mockResolvedValue(false);

    const result = await service.scan(token, staffUser, headers);

    expect(result.status).toBe('FORBIDDEN');
    expect(ticketsClient.validate).not.toHaveBeenCalled();
  });

  it('SUPER_ADMIN salta el chequeo de EventAccess', async () => {
    const token = signTicketToken('ticket-1', QR_SECRET);
    ticketsClient.peek.mockResolvedValue({ id: 'ticket-1', zoneId: 'zone-1', eventId: 'event-1', userId: 'user-1', scannedAt: null });
    ticketsClient.validate.mockResolvedValue({
      valid: true,
      ticket: { id: 'ticket-1', zoneId: 'zone-1', userId: 'user-1' },
    });

    const result = await service.scan(token, superAdminUser, headers);

    expect(result.status).toBe('VALID');
    expect(eventAccess.isAuthorized).not.toHaveBeenCalled();
  });

  it('registra TODO intento en el ScanLog, incluso los inválidos', async () => {
    await service.scan('basura', staffUser, headers);

    expect(prisma.scanLog.create).toHaveBeenCalledTimes(1);
  });
});
