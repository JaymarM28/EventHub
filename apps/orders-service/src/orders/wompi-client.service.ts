import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { createHash } from 'crypto';

export type WompiTransactionStatus = 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING';

export interface WompiTransaction {
  id: string;
  status: WompiTransactionStatus;
  reference: string;
  amount_in_cents: number;
  currency: string;
}

/// PENDING confirmado en vivo contra el sandbox real de Wompi — la
/// documentación pública no lo lista, pero el sandbox lo devuelve en la
/// práctica (mismo criterio que el status del pago original: async).
export type WompiRefundStatus = 'APPROVED' | 'PENDING' | 'DECLINED' | 'ERROR' | 'CANCELLED';

export interface WompiRefund {
  /// Verificado en vivo contra el sandbox: Wompi devuelve esto como
  /// NÚMERO, no string (a diferencia de `WompiTransaction.id`) — casteado
  /// a string al guardar (Order.wompiRefundId es String en el schema).
  id: number;
  status: WompiRefundStatus;
  amount_in_cents: number;
}

/** #22 — Wompi rechaza la llave PÚBLICA para reembolsos (a diferencia de
 * `getTransaction`, que sí acepta la pública); ver docs Refunds V2. */
export class RefundDeclinedError extends Error {}

interface WompiEventBody {
  data?: { transaction?: { id?: string; status?: string; reference?: string } };
  signature?: { properties?: string[]; checksum?: string };
  timestamp?: number;
}

/**
 * Reemplaza a Mercado Pago (Fase D #20 — bloqueado en un error genérico de
 * sandbox nunca diagnosticado con soporte, decisión del usuario 2026-09-26
 * de reintentar con otro proveedor). Wompi (Bancolombia) permite
 * credenciales de prueba para persona natural sin Cámara de Comercio.
 *
 * A diferencia del Checkout Pro de Mercado Pago (que exige llamar a su API
 * para crear una "preferencia" antes de tener una URL), el Widget/Checkout
 * Web de Wompi es una URL firmada que se arma enteramente LOCAL — no hace
 * falta ninguna llamada de red para iniciar un checkout, solo un hash
 * SHA-256. Esto simplifica `OrdersService.checkout()`: ya no puede fallar
 * por una llamada de red a Wompi, solo por la reserva en tickets-service.
 */
@Injectable()
export class WompiClientService {
  private readonly logger = new Logger(WompiClientService.name);
  private readonly publicKey: string;
  private readonly privateKey: string;
  private readonly integritySecret: string;
  readonly eventsSecret: string;
  private readonly apiBaseUrl: string;
  private readonly checkoutReturnBaseUrl: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.publicKey = config.getOrThrow<string>('WOMPI_PUBLIC_KEY');
    this.privateKey = config.getOrThrow<string>('WOMPI_PRIVATE_KEY');
    this.integritySecret = config.getOrThrow<string>('WOMPI_INTEGRITY_SECRET');
    this.eventsSecret = config.getOrThrow<string>('WOMPI_EVENTS_SECRET');
    // Sandbox y producción son la MISMA API, solo cambia la base URL (ver
    // https://docs.wompi.co/en/docs/colombia/ambientes-y-llaves/) — el
    // ambiente real lo determina el PREFIJO de las keys (pub_test_/prv_test_
    // vs pub_prod_/prv_prod_), esta URL solo tiene que coincidir con esas keys.
    this.apiBaseUrl = config.get<string>('WOMPI_API_BASE_URL') ?? 'https://sandbox.wompi.co/v1';
    // Mismo uso que en Mercado Pago: adónde redirige el WebView al terminar
    // el pago (ver OrdersController.checkoutReturn).
    this.checkoutReturnBaseUrl = config.getOrThrow<string>('API_PUBLIC_URL');
  }

  /**
   * Arma la URL del Widget/Checkout Web de Wompi — sin llamada de red, la
   * "firma de integridad" es un hash local que Wompi valida al recibir el
   * checkout (evita que alguien arme una URL con un monto distinto al que
   * cobramos de verdad).
   */
  buildCheckoutUrl(orderId: string, amount: number, currency: string): string {
    const amountInCents = Math.round(amount * 100);
    const integritySignature = createHash('sha256')
      .update(`${orderId}${amountInCents}${currency}${this.integritySecret}`)
      .digest('hex');

    const params = new URLSearchParams({
      'public-key': this.publicKey,
      currency,
      'amount-in-cents': String(amountInCents),
      reference: orderId,
      'signature:integrity': integritySignature,
      'redirect-url': `${this.checkoutReturnBaseUrl}/orders/checkout-return/wompi`,
    });
    return `https://checkout.wompi.co/p/?${params.toString()}`;
  }

  /**
   * Misma filosofía que `MercadoPagoClientService.getPayment` (ver git
   * history) — nunca se confía en el body del evento de Wompi más allá de
   * usarlo para saber QUÉ transacción re-consultar. Esta consulta
   * autenticada a la API es la fuente de verdad real.
   */
  async getTransaction(transactionId: string): Promise<WompiTransaction> {
    const response = await firstValueFrom(
      this.http.get<{ data: WompiTransaction }>(`${this.apiBaseUrl}/transactions/${transactionId}`, {
        headers: { Authorization: `Bearer ${this.publicKey}` },
      }),
    );
    return response.data.data;
  }

  /**
   * Verifica que el evento de verdad vino de Wompi ANTES de gastar una
   * consulta de red re-confirmando la transacción — defensa en profundidad,
   * no el único mecanismo de confianza (eso sigue siendo `getTransaction`).
   * Algoritmo exacto de Wompi: concatenar los valores de `signature.properties`
   * (dot-paths dentro de `data`, en orden) + `timestamp` + el secreto de
   * eventos, SHA-256, comparar con `signature.checksum`.
   */
  /**
   * #22 — API de Refunds V2 de Wompi: `POST /v1/refunds` con la llave
   * PRIVADA (no la pública que usa `getTransaction`/el checkout), monto
   * exacto en centavos. Respuesta síncrona (HTTP 201) con el status ya
   * resuelto — a diferencia de `getTransaction` (pago original), acá no
   * hace falta un webhook aparte para saber el resultado.
   */
  async refundTransaction(transactionId: string, amountInCents: number, reason: string): Promise<WompiRefund> {
    const response = await firstValueFrom(
      this.http.post<{ data: WompiRefund }>(
        `${this.apiBaseUrl}/refunds`,
        { transaction_id: transactionId, amount_in_cents: amountInCents, reason },
        { headers: { Authorization: `Bearer ${this.privateKey}` } },
      ),
    );
    return response.data.data;
  }

  verifyEventChecksum(body: WompiEventBody): boolean {
    const { signature, timestamp, data } = body;
    if (!signature?.properties?.length || !signature.checksum || timestamp === undefined) {
      return false;
    }
    const values = signature.properties.map((path) =>
      path.split('.').reduce<unknown>((obj, key) => (obj as Record<string, unknown> | undefined)?.[key], data),
    );
    const concatenated = values.join('') + String(timestamp) + this.eventsSecret;
    const checksum = createHash('sha256').update(concatenated).digest('hex');
    const valid = checksum.toLowerCase() === String(signature.checksum).toLowerCase();
    if (!valid) {
      this.logger.warn('Checksum de evento de Wompi inválido — ignorado');
    }
    return valid;
  }
}
