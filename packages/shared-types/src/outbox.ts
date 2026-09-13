/**
 * Contrato del patrón transactional outbox (premisa 8 de DESIGN.md).
 * orders-service escribe una fila aquí en la MISMA transacción que confirma
 * el pago; un poller aparte la lee y publica a RabbitMQ con reintento/backoff.
 */
export interface OutboxEventRow {
  id: string; // igual al eventId del EventEnvelope
  type: string;
  payload: unknown;
  createdAt: Date;
  publishedAt: Date | null;
  attempts: number;
  lastError: string | null;
}
