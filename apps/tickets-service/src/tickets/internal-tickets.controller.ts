import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Public } from '@event-hub/internal-auth';
import { TicketsService } from './tickets.service';

/**
 * Prefijo separado a propósito (`internal/tickets`, no `tickets`) — el
 * gateway solo expone `/tickets` para GET /mine (client-facing). Como el
 * ruteo del gateway es por prefijo, no por sub-ruta, meter esta validación
 * bajo `/tickets` habría dejado a cualquier cliente con JWT válido marcar
 * el boleto de otra persona como usado. Al vivir en un prefijo que el
 * gateway nunca registra, solo es alcanzable por llamada directa
 * service-to-service (access-service → tickets-service, Finding 1).
 *
 * `validate` sí exige el contexto interno firmado (acción con efectos
 * reales, y access-service ya reenvía el header de la request original).
 * `summary` y `peek` son `@Public()` a propósito — las llama
 * events-service (dashboard, sin representar a un usuario final
 * específico) y api-gateway (consumidor RMQ de ticket.issued, sin ninguna
 * request HTTP de la que colgar un contexto de usuario) — el aislamiento
 * de red (nunca expuesto por el gateway) sigue siendo el límite de
 * seguridad real, igual que ya razona el comentario de arriba.
 */
@Controller('internal/tickets')
export class InternalTicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post(':id/validate')
  validate(@Param('id') id: string) {
    return this.ticketsService.validateScan(id);
  }

  // Debe declararse ANTES de `:id` — ver el comentario equivalente en
  // events.controller.ts sobre orden de rutas en Nest.
  /** Usado por events-service para el dashboard del organizador (cuántos
   * boletos se vendieron por zona) — nunca por el cliente final. */
  @Get('summary')
  @Public()
  summary(@Query('zoneIds') zoneIds: string) {
    const ids = zoneIds ? zoneIds.split(',').filter(Boolean) : [];
    return this.ticketsService.soldCountByZone(ids);
  }

  /** Solo lectura — ver el comentario en TicketsService.peek(). Público:
   * lo llama el consumidor RMQ de api-gateway (sin request HTTP de la que
   * colgar un contexto de usuario), además de access-service. */
  @Get(':id')
  @Public()
  peek(@Param('id') id: string) {
    return this.ticketsService.peek(id);
  }
}
