import { createHmac, timingSafeEqual } from 'crypto';

/**
 * El "contenido" que se codifica en el QR del boleto: un token firmado con
 * HMAC-SHA256 usando TICKET_QR_SECRET (compartido entre tickets-service, que
 * lo emite, y access-service, que lo valida en el paso 7). No es un JWT
 * completo a propósito — solo necesita probar que el ticketId es genuino,
 * no transportar claims de usuario.
 */
export function signTicketToken(ticketId: string, secret: string): string {
  const signature = createHmac('sha256', secret).update(ticketId).digest('hex');
  return `${ticketId}.${signature}`;
}

export function verifyTicketToken(token: string, secret: string): string {
  const [ticketId, signature] = token.split('.');
  if (!ticketId || !signature) {
    throw new Error('Formato de token de boleto inválido');
  }

  const expected = createHmac('sha256', secret).update(ticketId).digest('hex');
  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Firma de boleto inválida');
  }

  return ticketId;
}
