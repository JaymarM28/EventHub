import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { InternalTicketsController } from './internal-tickets.controller';
import { TicketsConsumer } from './tickets.consumer';
import { TicketsService } from './tickets.service';

@Module({
  controllers: [TicketsController, InternalTicketsController, TicketsConsumer],
  providers: [TicketsService],
})
export class TicketsModule {}
