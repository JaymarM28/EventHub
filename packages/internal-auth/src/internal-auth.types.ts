/**
 * Roles del sistema — deben mantenerse en sync con auth-service (paso 2).
 * VENDOR y STAFF están definidos pero no operativos en el flujo core
 * (ver DESIGN.md, Open Questions).
 */
export type UserRole =
  | 'SUPER_ADMIN'
  | 'ORGANIZER'
  | 'STAFF'
  | 'VENDOR'
  | 'ATTENDEE';

/**
 * Contexto de usuario que api-gateway extrae del JWT tras validarlo, y que
 * reenvía firmado a los servicios internos vía el header X-Internal-Context.
 * Los servicios internos confían en este contexto sin revalidar el JWT
 * (eng review Finding 3/9 — evita duplicar lógica de auth en 6 servicios).
 */
export interface InternalUserContext {
  userId: string;
  email: string;
  roles: UserRole[];
  /** Timestamp (epoch ms) en que api-gateway validó el JWT original. */
  validatedAt: number;
}

export const INTERNAL_CONTEXT_HEADER = 'x-internal-context';
export const INTERNAL_SIGNATURE_HEADER = 'x-internal-signature';
