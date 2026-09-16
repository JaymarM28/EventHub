import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InternalAuthGuard, Roles, RolesGuard } from '@event-hub/internal-auth';
import { AuthService } from './auth.service';
import { CreateInternalUserDto } from './dto/create-internal-user.dto';

/**
 * Prefijo separado a propósito (`internal/users`, no `auth`) — igual que
 * `internal/tickets` en tickets-service: api-gateway nunca registra un
 * prefijo `/internal`, así que esto solo es alcanzable por llamada directa
 * service-to-service (events-service → auth-service, al dar de alta STAFF
 * para un evento — ver EventsController.addStaff).
 *
 * A diferencia del resto de auth-service (register/login/refresh, público
 * y sin guard), este SÍ exige el contexto interno firmado — reenviado tal
 * cual por events-service desde la llamada original del organizador — y
 * además el rol de quien lo originó, como defensa en profundidad: si
 * events-service tuviera un bug y dejara pasar a alguien sin ownership del
 * evento, este endpoint igual rechaza crear cuentas a cualquiera que no
 * sea ORGANIZER/SUPER_ADMIN.
 */
@Controller('internal/users')
@UseGuards(new InternalAuthGuard(process.env.INTERNAL_AUTH_SECRET!, new Reflector()), RolesGuard)
@Roles('ORGANIZER', 'SUPER_ADMIN')
export class InternalUsersController {
  constructor(private readonly authService: AuthService) {}

  @Post()
  create(@Body() dto: CreateInternalUserDto) {
    return this.authService.createWithRoles(dto);
  }
}
