import { Body, Controller, Get, Post } from '@nestjs/common';
import { InternalHeaders, InternalUser, InternalUserContext, RawInternalHeaders } from '@event-hub/internal-auth';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('checkout')
  checkout(
    @Body() dto: CreateOrderDto,
    @InternalUser() user: InternalUserContext,
    @InternalHeaders() headers: RawInternalHeaders,
  ) {
    return this.ordersService.checkout(dto.zoneId, dto.quantity, user.userId, headers);
  }

  @Get('mine')
  findMine(@InternalUser() user: InternalUserContext) {
    return this.ordersService.findByUser(user.userId);
  }
}
