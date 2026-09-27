import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InternalAuthGuard } from '@event-hub/internal-auth';
import { AuthService } from './auth.service';

/**
 * Controlador separado del de `POST /internal/users` a propósito: esa
 * creación exige rol ORGANIZER/SUPER_ADMIN (defensa en profundidad al dar
 * de alta STAFF), pero buscar un email para transferir UN BOLETO PROPIO
 * (tickets-service → aquí, ver TicketsService.transferTo) es una operación
 * que cualquier usuario autenticado debe poder disparar sobre sí mismo —
 * la restricción real de "solo el dueño puede transferir su boleto" ya la
 * aplica tickets-service antes de llamar acá.
 */
@Controller('internal/users')
@UseGuards(new InternalAuthGuard(process.env.INTERNAL_AUTH_SECRET!, new Reflector()))
export class InternalUserLookupController {
  constructor(private readonly authService: AuthService) {}

  @Get('by-email')
  findByEmail(@Query('email') email: string) {
    return this.authService.findByEmail(email);
  }

  // Debe declararse DESPUÉS de 'by-email' — igual que /events/mine antes de
  // /events/:id en events-service, si no Nest resolvería "by-email" como
  // si fuera un :id.
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.authService.findById(id);
  }
}
