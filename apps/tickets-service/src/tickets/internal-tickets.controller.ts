import { Controller, Param, Post } from '@nestjs/common';
import { TicketsService } from './tickets.service';

/**
 * Prefijo separado a propósito (`internal/tickets`, no `tickets`) — el
 * gateway solo expone `/tickets` para GET /mine (client-facing). Como el
 * ruteo del gateway es por prefijo, no por sub-ruta, meter esta validación
 * bajo `/tickets` habría dejado a cualquier cliente con JWT válido marcar
 * el boleto de otra persona como usado. Al vivir en un prefijo que el
 * gateway nunca registra, solo es alcanzable por llamada directa
 * service-to-service (access-service → tickets-service, Finding 1).
 */
@Controller('internal/tickets')
export class InternalTicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post(':id/validate')
  validate(@Param('id') id: string) {
    return this.ticketsService.validateScan(id);
  }
}
