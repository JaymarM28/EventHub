import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { signTicketToken } from '@event-hub/shared-types';
import { ScansService } from './scans.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsClientService, TicketsServiceUnavailableError } from './tickets-client.service';

const QR_SECRET = 'test-qr-secret';
const headers = { 'x-internal-context': 'p', 'x-internal-signature': 's' };

describe('ScansService', () => {
  let service: ScansService;
  let prisma: { scanLog: { create: jest.Mock } };
  let ticketsClient: { validate: jest.Mock };

  beforeEach(async () => {
    prisma = { scanLog: { create: jest.fn().mockResolvedValue({}) } };
    ticketsClient = { validate: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ScansService,
        { provide: PrismaService, useValue: prisma },
        { provide: TicketsClientService, useValue: ticketsClient },
        { provide: ConfigService, useValue: { getOrThrow: () => QR_SECRET } },
      ],
    }).compile();

    service = moduleRef.get(ScansService);
  });

  it('VALID: boleto genuino y no usado', async () => {
    const token = signTicketToken('ticket-1', QR_SECRET);
    ticketsClient.validate.mockResolvedValue({
      valid: true,
      ticket: { id: 'ticket-1', zoneId: 'zone-1', userId: 'user-1' },
    });

    const result = await service.scan(token, 'staff-1', headers);

    expect(result).toEqual({
      status: 'VALID',
      ticket: { id: 'ticket-1', zoneId: 'zone-1', userId: 'user-1' },
    });
    expect(prisma.scanLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ result: 'VALID', ticketId: 'ticket-1' }) }),
    );
  });

  it('ALREADY_USED: boleto genuino pero ya escaneado antes', async () => {
    const token = signTicketToken('ticket-1', QR_SECRET);
    ticketsClient.validate.mockResolvedValue({
      valid: false,
      reason: 'Este boleto ya fue usado',
      scannedAt: '2026-01-01T00:00:00.000Z',
    });

    const result = await service.scan(token, 'staff-1', headers);

    expect(result.status).toBe('ALREADY_USED');
  });

  it('INVALID: QR con firma alterada — ni siquiera llama a tickets-service', async () => {
    const result = await service.scan('ticket-1.firma-falsa', 'staff-1', headers);

    expect(result.status).toBe('INVALID');
    expect(ticketsClient.validate).not.toHaveBeenCalled();
  });

  it('INVALID: boleto con firma válida pero que no existe en tickets-service', async () => {
    const token = signTicketToken('no-existe', QR_SECRET);
    ticketsClient.validate.mockRejectedValue(new NotFoundException());

    const result = await service.scan(token, 'staff-1', headers);

    expect(result.status).toBe('INVALID');
  });

  it('DEGRADED: tickets-service no responde — nunca se degrada en silencio a inválido', async () => {
    const token = signTicketToken('ticket-1', QR_SECRET);
    ticketsClient.validate.mockRejectedValue(new TicketsServiceUnavailableError());

    const result = await service.scan(token, 'staff-1', headers);

    expect(result.status).toBe('DEGRADED');
    if (result.status === 'DEGRADED') {
      expect(result.message).toMatch(/validar manualmente/);
    }
  });

  it('registra TODO intento en el ScanLog, incluso los inválidos', async () => {
    await service.scan('basura', 'staff-1', headers);

    expect(prisma.scanLog.create).toHaveBeenCalledTimes(1);
  });
});
