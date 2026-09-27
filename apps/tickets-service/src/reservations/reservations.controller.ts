import { BadRequestException, Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { InternalUser, InternalUserContext } from '@event-hub/internal-auth';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

/**
 * Llamado SÍNCRONAMENTE por orders-service durante el checkout (Finding 1
 * del eng review) — no es un endpoint pensado para un cliente final, pero
 * pasa por el mismo InternalAuthGuard que cualquier otro request: orders-
 * service reenvía el header interno que ya recibió de api-gateway.
 */
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  create(@Body() dto: CreateReservationDto, @InternalUser() user: InternalUserContext) {
    if (dto.seatIds !== undefined && dto.quantity !== undefined) {
      throw new BadRequestException('Enviá quantity o seatIds, no ambos');
    }
    if (dto.seatIds !== undefined) {
      return this.reservationsService.reserveSeats(dto.zoneId, user.userId, dto.seatIds);
    }
    if (dto.quantity === undefined) {
      throw new BadRequestException('Falta quantity o seatIds');
    }
    return this.reservationsService.reserve(dto.zoneId, user.userId, dto.quantity);
  }

  @Delete(':id')
  async release(@Param('id') id: string) {
    await this.reservationsService.release(id);
  }
}
