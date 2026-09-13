import { Controller, Get } from '@nestjs/common';
import { InternalUser, InternalUserContext } from '@event-hub/internal-auth';
import { TicketsService } from './tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get('mine')
  findMine(@InternalUser() user: InternalUserContext) {
    return this.ticketsService.findByUser(user.userId);
  }
}
