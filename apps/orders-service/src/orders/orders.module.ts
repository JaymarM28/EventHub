import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OrdersController } from './orders.controller';
import { OrdersConsumer } from './orders.consumer';
import { OrdersService } from './orders.service';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { TicketsClientService } from './tickets-client.service';
import { WompiClientService } from './wompi-client.service';
import { EventsClientService } from './events-client.service';

@Module({
  imports: [HttpModule],
  controllers: [OrdersController, PayoutsController, OrdersConsumer],
  providers: [OrdersService, PayoutsService, TicketsClientService, WompiClientService, EventsClientService],
})
export class OrdersModule {}
