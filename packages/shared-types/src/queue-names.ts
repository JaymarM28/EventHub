/**
 * Convención de nombres de colas/exchanges. Cada cola de negocio tiene su
 * dead-letter queue hermana con sufijo `.dlq` (contrato de la premisa 7).
 */
export const EXCHANGES = {
  DOMAIN_EVENTS: 'event-hub.domain-events',
} as const;

export const EVENT_TYPES = {
  EVENT_CREATED: 'event.created',
  EVENT_UPDATED: 'event.updated',
  EVENT_CANCELLED: 'event.cancelled', // fase stretch — ver Open Questions
  EVENT_STAFF_ASSIGNED: 'event.staff-assigned',
  ORDER_PAID: 'order.paid',
  ORDER_REFUNDED: 'order.refunded', // fase stretch
  TICKET_ISSUED: 'ticket.issued',
  /// Notificaciones push (2026-09-29): events-service dispara esto vía un
  /// cron cuando un evento está por empezar (ver events-service/src/events/
  /// event-reminders.service.ts) — notifications-service lo consume para
  /// avisarle a cada comprador, resolviendo la lista vía orders-service.
  EVENT_REMINDER_DUE: 'event.reminder-due',
  /// Lista de espera (#11, 2026-09-30): tickets-service lo publica, uno
  /// por persona, cuando un reembolso libera cupo en una zona agotada (ver
  /// WaitlistService.notifyFreedSlots) — notifications-service lo consume
  /// para avisarle a cada uno.
  WAITLIST_SLOT_AVAILABLE: 'waitlist.slot-available',
} as const;

export function queueFor(consumerService: string): string {
  return `event-hub.${consumerService}.queue`;
}

export function deadLetterQueueFor(consumerService: string): string {
  return `${queueFor(consumerService)}.dlq`;
}

export function deadLetterExchangeFor(consumerService: string): string {
  return `${queueFor(consumerService)}.dlx`;
}
