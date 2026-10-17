import { Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { InternalUser, InternalUserContext } from '@event-hub/internal-auth';
import { WaitlistService } from './waitlist.service';

/** #11 — ver WaitlistService para el diseño completo. Cualquier usuario
 * autenticado puede anotarse, sin rol especial. */
@Controller('tickets/zones/:zoneId/waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post()
  join(@Param('zoneId') zoneId: string, @InternalUser() user: InternalUserContext) {
    return this.waitlistService.join(zoneId, user.userId);
  }

  @Delete()
  @HttpCode(204)
  async leave(@Param('zoneId') zoneId: string, @InternalUser() user: InternalUserContext) {
    await this.waitlistService.leave(zoneId, user.userId);
  }

  @Get('me')
  status(@Param('zoneId') zoneId: string, @InternalUser() user: InternalUserContext) {
    return this.waitlistService.status(zoneId, user.userId);
  }
}
