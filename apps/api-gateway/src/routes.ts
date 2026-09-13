/**
 * Tabla de ruteo del gateway. Se extiende a medida que se construyen los
 * demás microservicios (events, tickets, orders, notifications, access).
 *
 * `public: true` significa que la ruta NO requiere un JWT válido — usado
 * para los propios endpoints de autenticación (no tendría sentido exigir
 * un token para poder hacer login). Todo lo demás pasa por
 * GatewayAuthMiddleware antes de llegar al proxy.
 */
export interface ServiceRoute {
  pathPrefix: string;
  target: string;
  public: boolean;
}

export function buildRoutes(): ServiceRoute[] {
  const authServiceUrl = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001';

  return [{ pathPrefix: '/auth', target: authServiceUrl, public: true }];
}
