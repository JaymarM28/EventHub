export const ORDER_EVENTS_CLIENT = 'ORDER_EVENTS_CLIENT';

/// #22 — antes orders-service era publish-only (ver comentario histórico
/// en messaging.module.ts); ahora también consume event.cancelled para
/// disparar el reembolso en bloque (OrdersConsumer).
export const CONSUMER_NAME = 'orders-service';
