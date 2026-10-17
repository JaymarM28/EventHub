import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TicketsController } from './tickets.controller';
import { InternalTicketsController } from './internal-tickets.controller';
import { TicketsConsumer } from './tickets.consumer';
import { TicketsService } from './tickets.service';
import { AuthClientService } from './auth-client.service';
import { WaitlistModule } from '../waitlist/waitlist.module';

@Module({
  imports: [HttpModule, WaitlistModule],
  controllers: [TicketsController, InternalTicketsController, TicketsConsumer],
  providers: [TicketsService, AuthClientService],
})
export class TicketsModule {}
