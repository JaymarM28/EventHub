import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { InternalUserContext } from './internal-auth.types';

/**
 * Decorador de parámetro para leer el usuario ya validado por InternalAuthGuard.
 *
 * Uso:
 *   @Get('me')
 *   getMe(@InternalUser() user: InternalUserContext) { ... }
 */
export const InternalUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): InternalUserContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.internalUser;
  },
);
