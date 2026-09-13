import jwt from 'jsonwebtoken';
import {
  InternalUserContext,
  UserRole,
  signInternalContext,
} from '@event-hub/internal-auth';

export class GatewayAuthError extends Error {}

interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: UserRole[];
}

/**
 * Núcleo de la validación del gateway (Finding 3/9 del eng review):
 * 1. Extrae y valida el JWT emitido por auth-service.
 * 2. Construye el contexto de usuario y lo firma con INTERNAL_AUTH_SECRET.
 *
 * Función pura (sin Express/Nest) para poder testearla sin levantar un
 * servidor HTTP.
 */
export function verifyAndSignInternalContext(
  authorizationHeader: string | undefined,
  jwtSecret: string,
  internalAuthSecret: string,
): { payload: string; signature: string } {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new GatewayAuthError('Falta el header Authorization: Bearer <token>');
  }

  const token = authorizationHeader.slice('Bearer '.length);

  let decoded: AccessTokenPayload;
  try {
    decoded = jwt.verify(token, jwtSecret) as AccessTokenPayload;
  } catch (err) {
    throw new GatewayAuthError(`Token inválido: ${(err as Error).message}`);
  }

  const context: InternalUserContext = {
    userId: decoded.sub,
    email: decoded.email,
    roles: decoded.roles,
    validatedAt: Date.now(),
  };

  return signInternalContext(context, internalAuthSecret);
}
