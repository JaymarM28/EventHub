import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InternalAuthGuard, Roles, RolesGuard } from '@event-hub/internal-auth';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';

/**
 * Panel de SUPER_ADMIN (plataforma), a diferencia de `internal/users` (que
 * NUNCA pasa por el gateway, solo llamadas service-to-service). Estas
 * rutas SÍ llegan por el gateway — ver api-gateway/routes.ts, que registra
 * `/auth/admin` con authMode 'required' ANTES del `/auth` general
 * (público) para que el JWT del admin se valide y llegue el contexto
 * interno firmado con sus roles, algo que el resto de `/auth` no hace a
 * propósito (login/register no requieren sesión previa).
 */
@Controller('auth/admin')
@UseGuards(new InternalAuthGuard(process.env.INTERNAL_AUTH_SECRET!, new Reflector()), RolesGuard)
@Roles('SUPER_ADMIN')
export class AdminUsersController {
  constructor(private readonly authService: AuthService) {}

  /** Rol fijo en ORGANIZER — a diferencia de `internal/users`, acá no se
   * acepta un arreglo de roles arbitrario desde el body (mismo endpoint
   * no debería poder usarse para crear otro SUPER_ADMIN por accidente). */
  @Post('organizers')
  createOrganizer(@Body() dto: RegisterDto) {
    return this.authService.createWithRoles({ ...dto, roles: ['ORGANIZER'] });
  }

  @Get('users')
  listUsers() {
    return this.authService.listUsers();
  }

  @Patch('users/:id/roles')
  updateRoles(@Param('id') id: string, @Body() dto: UpdateUserRolesDto) {
    return this.authService.updateRoles(id, dto.roles);
  }
}
