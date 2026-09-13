import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyTicketToken } from '@event-hub/shared-types';
import { RawInternalHeaders } from '@event-hub/internal-auth';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsClientService, TicketsServiceUnavailableError } from './tickets-client.service';

export type ScanOutcome =
  | { status: 'VALID'; ticket: { id: string; zoneId: string; userId: string } }
  | { status: 'ALREADY_USED'; message: string; scannedAt: string }
  | { status: 'INVALID'; message: string }
  | { status: 'DEGRADED'; message: string };

@Injectable()
export class ScansService {
  private readonly qrSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketsClient: TicketsClientService,
    config: ConfigService,
  ) {
    this.qrSecret = config.getOrThrow<string>('TICKET_QR_SECRET');
  }

  async scan(qrToken: string, scannedBy: string, headers: RawInternalHeaders): Promise<ScanOutcome> {
    let ticketId: string;
    try {
      // Verificación offline primero — un QR forjado o corrupto se rechaza
      // sin siquiera llamar a tickets-service.
      ticketId = verifyTicketToken(qrToken, this.qrSecret);
    } catch (err) {
      return this.finish(null, 'INVALID', (err as Error).message, scannedBy);
    }

    try {
      const result = await this.ticketsClient.validate(ticketId, headers);
      if (result.valid) {
        return this.finish(ticketId, 'VALID', null, scannedBy, result.ticket);
      }
      return this.finish(ticketId, 'ALREADY_USED', result.reason, scannedBy, undefined, result.scannedAt);
    } catch (err) {
      if (err instanceof NotFoundException) {
        return this.finish(ticketId, 'INVALID', 'Boleto no existe', scannedBy);
      }
      if (err instanceof TicketsServiceUnavailableError) {
        // TODO 3 de TODOS.md, resuelto: nunca un 401/500 genérico ni un
        // "denegado" silencioso — el staff ve explícitamente que hubo un
        // problema de conectividad y decide manualmente.
        return this.finish(
          ticketId,
          'DEGRADED',
          'No se pudo verificar en tiempo real — validar manualmente',
          scannedBy,
        );
      }
      throw err;
    }
  }

  private async finish(
    ticketId: string | null,
    status: ScanOutcome['status'],
    message: string | null,
    scannedBy: string,
    ticket?: { id: string; zoneId: string; userId: string },
    scannedAt?: string,
  ): Promise<ScanOutcome> {
    await this.prisma.scanLog.create({
      data: { ticketId, result: status, reason: message, scannedBy },
    });

    if (status === 'VALID') return { status: 'VALID', ticket: ticket! };
    if (status === 'ALREADY_USED') return { status: 'ALREADY_USED', message: message!, scannedAt: scannedAt! };
    if (status === 'INVALID') return { status: 'INVALID', message: message! };
    return { status: 'DEGRADED', message: message! };
  }
}
