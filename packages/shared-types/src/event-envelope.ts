/**
 * Contrato de eventos entre microservicios (premisa 7 de DESIGN.md).
 *
 * Todo evento publicado a RabbitMQ debe usar este envelope. El contrato se
 * fija aquí desde el paso 1; la IMPLEMENTACIÓN real de dedupe/DLQ se
 * construye contra el primer consumidor concreto (events-service, paso 4;
 * tickets/orders, paso 5) — no antes, para no diseñar en el vacío
 * (eng review, hallazgo de la voz externa).
 */
export interface EventEnvelope<TPayload = unknown> {
  /** UUID único de esta instancia del evento — usado como idempotency key. */
  eventId: string;
  /** Tipo de evento, ej. "order.paid", "event.created", "ticket.issued". */
  type: string;
  /** Epoch ms de cuándo ocurrió el hecho de negocio (no cuándo se publicó). */
  occurredAt: number;
  /** Servicio que originó el evento, ej. "orders-service". */
  source: string;
  /** Cuerpo específico del evento. */
  payload: TPayload;
}

/**
 * Todo consumidor de eventos DEBE:
 * 1. Antes de procesar, verificar si `eventId` ya fue procesado (dedupe store
 *    — Redis o tabla `processed_events` en la DB del propio servicio).
 * 2. Si ya fue procesado, hacer ACK sin reprocesar (idempotencia).
 * 3. Si el procesamiento falla, dejar que el broker reintente con backoff;
 *    tras N intentos, el mensaje va a la dead-letter queue correspondiente
 *    (convención de nombres en queue-names.ts).
 */
export interface IdempotentConsumer {
  hasProcessed(eventId: string): Promise<boolean>;
  markProcessed(eventId: string): Promise<void>;
}
