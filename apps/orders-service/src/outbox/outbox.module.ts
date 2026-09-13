import { Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';

@Module({
  providers: [OutboxService],
})
export class OutboxModule {}
