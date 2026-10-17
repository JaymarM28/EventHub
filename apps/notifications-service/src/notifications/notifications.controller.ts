import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { InternalUser, InternalUserContext } from '@event-hub/internal-auth';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly pushService: PushService,
  ) {}

  @Get('mine')
  findMine(@InternalUser() user: InternalUserContext) {
    return this.notifications.findByUser(user.userId);
  }

  /** La app llama esto al arrancar (si el usuario dio permiso de
   * notificaciones) y cada vez que FCM rota el token del dispositivo. */
  @Post('device-tokens')
  registerDeviceToken(@InternalUser() user: InternalUserContext, @Body() dto: RegisterDeviceTokenDto) {
    return this.pushService.registerToken(user.userId, dto.token, dto.platform);
  }

  /** Al cerrar sesión — evita seguir mandándole push a un dispositivo cuyo
   * usuario ya no está logueado con esa cuenta. */
  @Delete('device-tokens/:token')
  unregisterDeviceToken(@Param('token') token: string) {
    return this.pushService.unregisterToken(token);
  }
}
