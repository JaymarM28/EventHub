import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { NotificationsController } from './notifications.controller';
import { InternalEmailsController } from './internal-emails.controller';
import { NotificationsConsumer } from './notifications.consumer';
import { NotificationsService } from './notifications.service';
import { UsersClientService } from './users-client.service';
import { EventsClientService } from './events-client.service';
import { OrdersClientService } from './orders-client.service';
import { EmailService } from './email.service';
import { PushService } from './push.service';

@Module({
  imports: [HttpModule],
  controllers: [NotificationsController, InternalEmailsController, NotificationsConsumer],
  providers: [NotificationsService, UsersClientService, EventsClientService, OrdersClientService, EmailService, PushService],
})
export class NotificationsModule {}
