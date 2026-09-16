import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DashboardGateway } from './dashboard.gateway';
import { DashboardConsumer } from './dashboard.consumer';
import { EventsClientService } from './events-client.service';
import { TicketsClientService } from './tickets-client.service';

@Module({
  imports: [HttpModule],
  controllers: [DashboardConsumer],
  providers: [DashboardGateway, EventsClientService, TicketsClientService],
})
export class DashboardModule {}
