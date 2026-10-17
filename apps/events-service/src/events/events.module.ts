import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { EventsController } from './events.controller';
import { InternalZonesController } from './internal-zones.controller';
import { EventsService } from './events.service';
import { EventRemindersService } from './event-reminders.service';
import { AuthClientService } from './auth-client.service';
import { TicketsClientService } from './tickets-client.service';
import { GeocodingService } from './geocoding.service';

@Module({
  imports: [HttpModule],
  controllers: [EventsController, InternalZonesController],
  providers: [EventsService, EventRemindersService, AuthClientService, TicketsClientService, GeocodingService],
})
export class EventsModule {}
