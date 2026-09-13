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
  ORDER_PAID: 'order.paid',
  ORDER_REFUNDED: 'order.refunded', // fase stretch
  TICKET_ISSUED: 'ticket.issued',
} as const;

export function queueFor(consumerService: string): string {
  return `event-hub.${consumerService}.queue`;
}

export function deadLetterQueueFor(consumerService: string): string {
  return `${queueFor(consumerService)}.dlq`;
}
