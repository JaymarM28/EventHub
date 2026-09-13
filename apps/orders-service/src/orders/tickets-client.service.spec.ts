import { of, throwError } from 'rxjs';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { HttpException } from '@nestjs/common';
import { TicketsClientService } from './tickets-client.service';

describe('TicketsClientService', () => {
  let service: TicketsClientService;
  let http: { post: jest.Mock; delete: jest.Mock };

  beforeEach(async () => {
    http = { post: jest.fn(), delete: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TicketsClientService,
        { provide: HttpService, useValue: http },
        { provide: ConfigService, useValue: { getOrThrow: () => 'http://localhost:3003' } },
      ],
    }).compile();

    service = moduleRef.get(TicketsClientService);
  });

  it('devuelve la reserva cuando tickets-service responde 2xx', async () => {
    http.post.mockReturnValue(of({ data: { reservationId: 'res-1', zoneId: 'z1', price: 50, expiresAt: 1 } }));

    const result = await service.reserve('z1', { 'x-internal-context': 'p', 'x-internal-signature': 's' });

    expect(result.reservationId).toBe('res-1');
  });

  it('traduce un 409 de tickets-service a un HttpException con el mismo status y mensaje (no un 500 genérico)', async () => {
    http.post.mockReturnValue(
      throwError(() => ({
        response: { status: 409, data: { message: 'Zona agotada' } },
      })),
    );

    await expect(
      service.reserve('z1', { 'x-internal-context': 'p', 'x-internal-signature': 's' }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Zona agotada',
    });
  });

  it('si tickets-service no responde (sin response), traduce a 503', async () => {
    http.post.mockReturnValue(throwError(() => new Error('ECONNREFUSED')));

    const err = await service
      .reserve('z1', { 'x-internal-context': 'p', 'x-internal-signature': 's' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(503);
  });
});
