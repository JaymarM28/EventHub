import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

/**
 * Envío real vía Resend (decidido con el usuario, Fase B — "un proveedor
 * que ofrezca sandbox"). `onboarding@resend.dev` es el remitente de
 * sandbox de Resend: funciona sin verificar un dominio propio, ideal para
 * este proyecto todavía sin dominio real. El mismo código sirve para
 * producción el día que haya un dominio verificado — solo cambia
 * EMAIL_FROM.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly fromEmail: string;

  constructor(config: ConfigService) {
    this.resend = new Resend(config.getOrThrow<string>('RESEND_API_KEY'));
    this.fromEmail = config.get<string>('EMAIL_FROM', 'Event Hub <onboarding@resend.dev>');
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    const { error } = await this.resend.emails.send({ from: this.fromEmail, to, subject, html });
    if (error) {
      // Convertido a excepción a propósito — quien llama (NotificationsService)
      // necesita que esto SÍ falle la transacción de idempotencia, no que
      // quede como un log silencioso (ver comentario en notify()).
      throw new Error(`Resend rechazó el envío: ${error.message}`);
    }
    this.logger.log(`Email enviado a ${to}: ${subject}`);
  }
}
