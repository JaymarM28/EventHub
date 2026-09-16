import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { AuthClientService } from './auth-client.service';
import { TicketsClientService } from './tickets-client.service';

@Module({
  imports: [HttpModule],
  controllers: [EventsController],
  providers: [EventsService, AuthClientService, TicketsClientService],
})
export class EventsModule {}
