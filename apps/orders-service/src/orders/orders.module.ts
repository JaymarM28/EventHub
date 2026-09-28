import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OrdersController } from './orders.controller';
import { OrdersConsumer } from './orders.consumer';
import { OrdersService } from './orders.service';
import { TicketsClientService } from './tickets-client.service';
import { WompiClientService } from './wompi-client.service';
import { EventsClientService } from './events-client.service';

@Module({
  imports: [HttpModule],
  controllers: [OrdersController, OrdersConsumer],
  providers: [OrdersService, TicketsClientService, WompiClientService, EventsClientService],
})
export class OrdersModule {}
