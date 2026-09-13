import { Controller, Get } from '@nestjs/common';
import { InternalUser, InternalUserContext } from '@event-hub/internal-auth';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('mine')
  findMine(@InternalUser() user: InternalUserContext) {
    return this.notifications.findByUser(user.userId);
  }
}
