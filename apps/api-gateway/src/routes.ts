/**
 * Tabla de ruteo del gateway. Se extiende a medida que se construyen los
 * demás microservicios (events, tickets, orders, notifications, access).
 *
 * `authMode`:
 * - 'public': nunca valida el JWT — usado para los propios endpoints de
 *   autenticación (no tendría sentido exigir un token para hacer login).
 * - 'optional': si viene un JWT válido, lo valida y agrega el header
 *   interno firmado; si NO viene ninguno, deja pasar sin ese header y el
 *   servicio interno decide (rutas @Public() lo aceptan, el resto responde
 *   401 por sí solo). Usado en servicios con endpoints mixtos, como
 *   events-service (listar es público, crear requiere rol ORGANIZER).
 * - 'required': el gateway exige un JWT válido y rechaza con 401 antes de
 *   llegar al servicio si falta o es inválido. Usado en servicios
 *   enteramente protegidos.
 */
export type AuthMode = 'public' | 'optional' | 'required';

export interface ServiceRoute {
  pathPrefix: string;
  target: string;
  authMode: AuthMode;
}

export function buildRoutes(): ServiceRoute[] {
  const authServiceUrl = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001';
  const eventsServiceUrl =
    process.env.EVENTS_SERVICE_URL ?? 'http://localhost:3002';
  const ticketsServiceUrl =
    process.env.TICKETS_SERVICE_URL ?? 'http://localhost:3003';
  const ordersServiceUrl =
    process.env.ORDERS_SERVICE_URL ?? 'http://localhost:3004';

  return [
    { pathPrefix: '/auth', target: authServiceUrl, authMode: 'public' },
    { pathPrefix: '/events', target: eventsServiceUrl, authMode: 'optional' },
    // Nota: POST /reservations de tickets-service NO se expone aquí a
    // propósito — es una llamada interna orders-service → tickets-service
    // (Finding 1), exponerla dejaría a un cliente reservar cupo sin pasar
    // por checkout/pago.
    { pathPrefix: '/tickets', target: ticketsServiceUrl, authMode: 'required' },
    { pathPrefix: '/orders', target: ordersServiceUrl, authMode: 'required' },
  ];
}
