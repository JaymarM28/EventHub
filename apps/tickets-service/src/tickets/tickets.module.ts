import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TicketsController } from './tickets.controller';
import { InternalTicketsController } from './internal-tickets.controller';
import { TicketsConsumer } from './tickets.consumer';
import { TicketsService } from './tickets.service';
import { AuthClientService } from './auth-client.service';

@Module({
  imports: [HttpModule],
  controllers: [TicketsController, InternalTicketsController, TicketsConsumer],
  providers: [TicketsService, AuthClientService],
})
export class TicketsModule {}
