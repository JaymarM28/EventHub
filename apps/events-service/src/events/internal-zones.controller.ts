import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { EventsService } from './events.service';
import { RedeemDiscountCodeDto } from './dto/discount-code.dto';

/**
 * Prefijo `internal/` — igual que `internal/tickets` en tickets-service:
 * api-gateway nunca registra este prefijo, solo alcanzable por llamada
 * directa service-to-service (notifications-service → acá, ver
 * NotificationsConsumer). El guard global de events-service
 * (InternalAuthGuard, ver app.module.ts) igual exige un contexto interno
 * firmado — sin @Public() a propósito, para no abrir esto a cualquiera
 * que adivine la URL en la red interna.
 */
@Controller('internal/zones')
export class InternalZonesController {
  constructor(private readonly eventsService: EventsService) {}

  @Get(':zoneId')
  findZoneWithOrganizer(@Param('zoneId') zoneId: string) {
    return this.eventsService.findZoneWithOrganizer(zoneId);
  }

  /** Llamado por orders-service durante el checkout (#23) — ver
   * EventsService.redeemDiscountCode para el canje atómico. */
  @Post(':zoneId/redeem-discount')
  redeemDiscount(@Param('zoneId') zoneId: string, @Body() dto: RedeemDiscountCodeDto) {
    return this.eventsService.redeemDiscountCode(zoneId, dto.code);
  }
}
