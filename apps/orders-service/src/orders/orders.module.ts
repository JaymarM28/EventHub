import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { TicketsClientService } from './tickets-client.service';

@Module({
  imports: [HttpModule, PaymentsModule],
  controllers: [OrdersController],
  providers: [OrdersService, TicketsClientService],
})
export class OrdersModule {}
