import { ConfigService } from '@nestjs/config';
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_SIGNATURE_HEADER,
  RawInternalHeaders,
  signInternalContext,
} from '@event-hub/internal-auth';

/**
 * El webhook de Stripe llama a orders-service SIN ningún request de
 * usuario final del cual reenviar un header firmado (mismo problema que
 * notifications-service llamando a auth-service/events-service, Fase B
 * #15) — acá aplica cuando el webhook necesita liberar una reserva en
 * tickets-service tras un pago fallido.
 */
export function buildSystemHeaders(config: ConfigService): RawInternalHeaders {
  const { payload, signature } = signInternalContext(
    { userId: 'system:orders-service', email: 'system@event-hub.internal', roles: ['SUPER_ADMIN'], validatedAt: Date.now() },
    config.getOrThrow<string>('INTERNAL_AUTH_SECRET'),
  );
  return { [INTERNAL_CONTEXT_HEADER]: payload, [INTERNAL_SIGNATURE_HEADER]: signature };
}
