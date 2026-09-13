import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsConsumer } from './notifications.consumer';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController, NotificationsConsumer],
  providers: [NotificationsService],
})
export class NotificationsModule {}
