import { Body, Controller, Post } from '@nestjs/common';
import { EmailService } from './email.service';
import { SendEmailDto } from './dto/send-email.dto';

/**
 * Prefijo `internal/` — nunca expuesto por el gateway (ver routes.ts),
 * solo alcanzable service-to-service. Genérico a propósito: a diferencia
 * de order.paid/ticket.issued (eventos de dominio consumidos vía RMQ, con
 * su propia idempotencia), verificación de email y recuperación de
 * contraseña (Fase B, #16/#17) son acciones síncronas iniciadas por un
 * usuario en auth-service — no hace falta duplicar la infraestructura de
 * outbox/RabbitMQ para dos casos puntuales, una llamada HTTP directa
 * alcanza (mismo criterio que orders→tickets, Finding 1 del eng review).
 * auth-service construye su propio HTML — este endpoint solo entrega.
 */
@Controller('internal/emails')
export class InternalEmailsController {
  constructor(private readonly emailService: EmailService) {}

  @Post()
  send(@Body() dto: SendEmailDto) {
    return this.emailService.send(dto.to, dto.subject, dto.html);
  }
}
