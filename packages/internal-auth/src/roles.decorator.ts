import { SetMetadata } from '@nestjs/common';
import { UserRole } from './internal-auth.types';

export const ROLES_KEY = 'roles';

/**
 * Restringe un endpoint a los roles indicados. Requiere RolesGuard registrado
 * DESPUÉS de InternalAuthGuard (el orden de guards importa: primero se
 * autentica — se llena request.internalUser —, luego se autoriza por rol).
 *
 * Uso: @Roles('ORGANIZER', 'SUPER_ADMIN')
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
