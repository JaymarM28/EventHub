import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScansController } from './scans.controller';
import { ScansService } from './scans.service';
import { TicketsClientService } from './tickets-client.service';

@Module({
  imports: [HttpModule],
  controllers: [ScansController],
  providers: [ScansService, TicketsClientService],
})
export class ScansModule {}
