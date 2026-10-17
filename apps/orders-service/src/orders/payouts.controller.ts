import { Body, Controller, Get, Put, Post, Query } from '@nestjs/common';
import { InternalUser, InternalUserContext, Roles } from '@event-hub/internal-auth';
import { PayoutsService } from './payouts.service';
import { UpsertPayoutAccountDto } from './dto/upsert-payout-account.dto';
import { SettlePayoutDto } from './dto/settle-payout.dto';

/** #24 — ver PayoutsService para el diseño completo (TODOS.md #13). */
@Controller('orders')
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get('payout-account/me')
  @Roles('ORGANIZER', 'SUPER_ADMIN')
  getMyAccount(@InternalUser() user: InternalUserContext) {
    return this.payoutsService.getAccount(user.userId);
  }

  @Put('payout-account/me')
  @Roles('ORGANIZER', 'SUPER_ADMIN')
  upsertMyAccount(@InternalUser() user: InternalUserContext, @Body() dto: UpsertPayoutAccountDto) {
    return this.payoutsService.upsertAccount(user.userId, dto);
  }

  /** Un organizador consulta su propio saldo resolviendo sus zoneIds del
   * lado del admin panel (vía /events/mine) — mismo patrón que
   * OrdersController.findByZones. Un SUPER_ADMIN puede pasar las zoneIds
   * de CUALQUIER organizador (las resuelve vía GET /events, público). */
  @Get('payouts/summary')
  @Roles('ORGANIZER', 'SUPER_ADMIN')
  summary(@Query('zoneIds') zoneIds: string) {
    const ids = zoneIds ? zoneIds.split(',').filter(Boolean) : [];
    return this.payoutsService.pendingSummary(ids);
  }

  /** Un ORGANIZER solo ve su propio historial, nunca el de otro — el query
   * param `organizerId` solo lo respeta si quien pregunta es SUPER_ADMIN. */
  @Get('payouts')
  @Roles('ORGANIZER', 'SUPER_ADMIN')
  list(@InternalUser() user: InternalUserContext, @Query('organizerId') organizerId?: string) {
    const targetId = user.roles.includes('SUPER_ADMIN') && organizerId ? organizerId : user.userId;
    return this.payoutsService.listPayouts(targetId);
  }

  /** Solo SUPER_ADMIN — es la plataforma reconociendo que YA transfirió la
   * plata por fuera, no algo que un organizador pueda autodeclararse. */
  @Post('payouts/settle')
  @Roles('SUPER_ADMIN')
  settle(@Body() dto: SettlePayoutDto) {
    return this.payoutsService.settle(dto.organizerId, dto.zoneIds, dto.externalReference, dto.notes);
  }

  /** Solo SUPER_ADMIN — cuánto genera la plataforma en total, no la parte
   * de ningún organizador en particular. */
  @Get('payouts/platform-revenue')
  @Roles('SUPER_ADMIN')
  platformRevenue() {
    return this.payoutsService.platformRevenue();
  }
}
