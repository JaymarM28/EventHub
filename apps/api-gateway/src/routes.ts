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
  const notificationsServiceUrl =
    process.env.NOTIFICATIONS_SERVICE_URL ?? 'http://localhost:3005';
  const accessServiceUrl = process.env.ACCESS_SERVICE_URL ?? 'http://localhost:3006';

  return [
    // Debe ir ANTES de `/auth` (público) — Express monta middlewares en
    // orden de registro, así que si `/auth` general fuera primero se
    // quedaría con /auth/admin/* también (mismo prefijo). Con este orden,
    // el panel de SUPER_ADMIN sí exige JWT válido y llega con el contexto
    // interno firmado (roles incluidos) que AdminUsersController exige.
    { pathPrefix: '/auth/admin', target: authServiceUrl, authMode: 'required' },
    { pathPrefix: '/auth', target: authServiceUrl, authMode: 'public' },
    { pathPrefix: '/events', target: eventsServiceUrl, authMode: 'optional' },
    // Establecimientos: catálogo de plataforma administrado por
    // SUPER_ADMIN, listado también por organizadores (para elegir uno al
    // crear un evento, a futuro — ver DESIGN.md Fase de plataforma).
    { pathPrefix: '/venues', target: eventsServiceUrl, authMode: 'required' },
    // Subida de imágenes (mapa de establecimiento, portada/galería de
    // evento) — vive en events-service (ver storage.module.ts) porque es
    // el único servicio que hoy necesita URLs de imagen persistentes.
    { pathPrefix: '/uploads', target: eventsServiceUrl, authMode: 'required' },
    // Nota: POST /reservations y todo /internal/tickets/* de tickets-service
    // NO se exponen aquí a propósito — son llamadas internas service-to-
    // service (orders→tickets para reservar, Finding 1; access→tickets
    // para validar un escaneo). El ruteo del gateway es por prefijo, así
    // que viven bajo prefijos que el gateway simplemente nunca registra —
    // solo alcanzables por llamada directa entre servicios.
    { pathPrefix: '/tickets', target: ticketsServiceUrl, authMode: 'required' },
    // Deben ir ANTES de `/orders` (mismo motivo que /auth/admin arriba):
    // Mercado Pago llama al webhook, y el WebView de Checkout Pro navega a
    // checkout-return, ninguno de los dos con un JWT nuestro.
    { pathPrefix: '/orders/webhooks', target: ordersServiceUrl, authMode: 'public' },
    { pathPrefix: '/orders/checkout-return', target: ordersServiceUrl, authMode: 'public' },
    { pathPrefix: '/orders', target: ordersServiceUrl, authMode: 'required' },
    { pathPrefix: '/notifications', target: notificationsServiceUrl, authMode: 'required' },
    { pathPrefix: '/access', target: accessServiceUrl, authMode: 'required' },
  ];
}
