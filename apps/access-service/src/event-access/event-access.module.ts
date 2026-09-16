import { Module } from '@nestjs/common';
import { EventAccessConsumer } from './event-access.consumer';
import { EventAccessService } from './event-access.service';

@Module({
  controllers: [EventAccessConsumer],
  providers: [EventAccessService],
  exports: [EventAccessService],
})
export class EventAccessModule {}
