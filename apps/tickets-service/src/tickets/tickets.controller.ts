import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { InternalHeaders, InternalUser, InternalUserContext, RawInternalHeaders } from '@event-hub/internal-auth';
import { TicketsService } from './tickets.service';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { TransferTicketDto } from './dto/transfer-ticket.dto';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get('mine')
  findMine(@InternalUser() user: InternalUserContext) {
    return this.ticketsService.findByUser(user.userId);
  }

  @Patch(':id/assign')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
    @InternalUser() user: InternalUserContext,
  ) {
    return this.ticketsService.assignTo(id, user.userId, dto.name);
  }

  @Patch(':id/transfer')
  transfer(
    @Param('id') id: string,
    @Body() dto: TransferTicketDto,
    @InternalUser() user: InternalUserContext,
    @InternalHeaders() headers: RawInternalHeaders,
  ) {
    return this.ticketsService.transferTo(id, user.userId, dto.toEmail, headers);
  }
}
