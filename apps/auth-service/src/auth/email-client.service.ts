import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_SIGNATURE_HEADER,
  signInternalContext,
} from '@event-hub/internal-auth';

/**
 * Mismo patrón que notifications-service/users-client.service.ts: quien
 * dispara esto (POST /auth/register, /auth/forgot-password) es un request
 * público SIN contexto interno firmado que reenviar (authMode 'public'
 * para todo /auth, a propósito — no se puede exigir sesión para
 * registrarse o pedir un reset), así que auth-service firma su propio
 * contexto de identidad "sistema" para llamar a notifications-service.
 *
 * Deliberadamente best-effort en los llamadores (ver auth.service.ts):
 * un email de verificación/reset que falla en enviarse no debe romper
 * el registro ni ocultar la respuesta genérica de forgot-password.
 */
@Injectable()
export class EmailClientService {
  private readonly logger = new Logger(EmailClientService.name);
  private readonly baseUrl: string;
  private readonly internalAuthSecret: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.baseUrl = config.getOrThrow<string>('NOTIFICATIONS_SERVICE_URL');
    this.internalAuthSecret = config.getOrThrow<string>('INTERNAL_AUTH_SECRET');
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    const { payload, signature } = signInternalContext(
      { userId: 'system:auth-service', email: 'system@event-hub.internal', roles: ['SUPER_ADMIN'], validatedAt: Date.now() },
      this.internalAuthSecret,
    );

    try {
      await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/internal/emails`,
          { to, subject, html },
          {
            headers: {
              [INTERNAL_CONTEXT_HEADER]: payload,
              [INTERNAL_SIGNATURE_HEADER]: signature,
            },
          },
        ),
      );
    } catch (err) {
      this.logger.warn(`No se pudo enviar el email a ${to}: ${(err as Error).message}`);
    }
  }
}
