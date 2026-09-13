import { createHmac, timingSafeEqual } from 'crypto';
import { InternalUserContext } from './internal-auth.types';

/**
 * Firma el contexto de usuario con HMAC-SHA256 usando INTERNAL_AUTH_SECRET
 * (compartido entre api-gateway y todos los servicios internos vía env var).
 * api-gateway llama a esto tras validar el JWT; nunca se expone al cliente.
 */
export function signInternalContext(
  context: InternalUserContext,
  secret: string,
): { payload: string; signature: string } {
  const payload = Buffer.from(JSON.stringify(context)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return { payload, signature };
}

/**
 * Verifica la firma y decodifica el contexto. Lanza si la firma no coincide
 * o si el contexto expiró — los servicios internos llaman esto en el guard,
 * nunca directamente en el controller.
 */
export function verifyInternalContext(
  payload: string,
  signature: string,
  secret: string,
  maxAgeMs = 60_000, // el header se genera por request, no debe vivir más de ~1 min
): InternalUserContext {
  const expected = createHmac('sha256', secret).update(payload).digest('hex');

  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Firma de contexto interno inválida');
  }

  const context = JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf-8'),
  ) as InternalUserContext;

  if (Date.now() - context.validatedAt > maxAgeMs) {
    throw new Error('Contexto interno expirado');
  }

  return context;
}
