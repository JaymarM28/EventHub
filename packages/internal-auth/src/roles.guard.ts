import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { InternalUserContext, UserRole } from './internal-auth.types';

/**
 * Debe registrarse DESPUÉS de InternalAuthGuard en la cadena de guards
 * (Nest ejecuta los guards de un mismo nivel en orden) — depende de que
 * request.internalUser ya esté poblado.
 *
 * Si un endpoint no tiene @Roles(...), este guard no restringe nada
 * (cualquier usuario autenticado pasa).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: InternalUserContext | undefined = request.internalUser;

    if (!user || !user.roles.some((role) => requiredRoles.includes(role))) {
      throw new ForbiddenException(
        `Requiere uno de estos roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
