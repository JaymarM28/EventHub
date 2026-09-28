import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { RawInternalHeaders } from '@event-hub/internal-auth';
import { EVENT_TYPES } from '@event-hub/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsClientService } from './tickets-client.service';
import { WompiClientService, WompiTransactionStatus } from './wompi-client.service';
import { EventsClientService } from './events-client.service';
import { buildSystemHeaders } from './system-headers';

const TERMINAL_FAILURE_STATUSES = new Set<WompiTransactionStatus>(['DECLINED', 'VOIDED', 'ERROR']);

/**
 * Fase D (#20): el pago simulado (charge síncrono, éxito/fallo inmediato)
 * se reemplazó primero por Mercado Pago, y luego por Wompi (bloqueado en
 * Mercado Pago sin diagnóstico posible, decisión del usuario 2026-09-26)
 * — en ambos casos el flujo es de REDIRECCIÓN: `checkout()` solo reserva
 * y arma la URL de pago, la app la abre en un WebView. La confirmación
 * real llega después, de forma asíncrona, vía el webhook de eventos de
 * Wompi (`handleWompiWebhook`) — recién ahí se marca PAID y se publica
 * order.paid. Antes de eso, la orden queda en PENDING.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketsClient: TicketsClientService,
    private readonly wompi: WompiClientService,
    private readonly eventsClient: EventsClientService,
    private readonly config: ConfigService,
  ) {}

  async checkout(
    zoneId: string,
    quantityOrSeatIds: number | string[],
    userId: string,
    userEmail: string,
    headers: RawInternalHeaders,
    discountCode?: string,
  ) {
    // 1. Reserva síncrona en tickets-service (Finding 1) — falla rápido si
    //    la zona no tiene cupos/butacas disponibles, antes de crear
    //    cualquier registro de orden. Fase 2: `quantityOrSeatIds` puede ser
    //    un array de butacas puntuales en vez de una cantidad contra cupo.
    const reservation = await this.ticketsClient.reserve(zoneId, quantityOrSeatIds, headers);
    // reservation.price es UNITARIO — el monto de la orden es el total.
    const subtotal = reservation.price * reservation.quantity;

    // 1b. #23 — canje ANTES de crear la orden: si el código es inválido,
    // no tiene sentido dejar una orden a medias. Si esto falla, se libera
    // la reserva recién adquirida (mismo criterio que un fallo de pago).
    let discountAmount = 0;
    let appliedCode: string | undefined;
    if (discountCode) {
      try {
        const discount = await this.eventsClient.redeemDiscountCode(zoneId, discountCode, headers);
        discountAmount =
          discount.type === 'PERCENTAGE'
            ? Math.round(subtotal * (Number(discount.value) / 100) * 100) / 100
            : Math.min(subtotal, Number(discount.value));
        appliedCode = discountCode.toUpperCase();
      } catch (err) {
        await this.ticketsClient.release(reservation.reservationId, headers).catch((releaseErr) => {
          this.logger.warn(
            `No se pudo liberar la reserva ${reservation.reservationId} tras código de descuento inválido: ${releaseErr.message}`,
          );
        });
        throw err;
      }
    }
    const totalAmount = subtotal - discountAmount;

    const order = await this.prisma.order.create({
      data: {
        userId,
        zoneId: reservation.zoneId,
        reservationId: reservation.reservationId,
        quantity: reservation.quantity,
        ...(reservation.seatIds && { seatIds: reservation.seatIds }),
        amount: totalAmount,
        currency: reservation.currency,
        ...(appliedCode && { discountCode: appliedCode, discountAmount }),
        status: 'PENDING',
      },
    });

    // 2. URL de Widget/Checkout Web de Wompi — arma local, sin llamada de
    //    red (ver comentario en WompiClientService.buildCheckoutUrl); el
    //    backend nunca ve datos de tarjeta, igual que con Mercado Pago.
    const checkoutUrl = this.wompi.buildCheckoutUrl(order.id, totalAmount, reservation.currency);

    return { ...order, checkoutUrl };
  }

  /**
   * Wompi manda un evento con la transacción completa embebida
   * (`data.transaction`), a diferencia del `{type, data:{id}}` liviano de
   * Mercado Pago — pero el principio es el mismo: no se confía en el body
   * más allá de saber QUÉ transacción re-consultar. Antes de eso, se
   * verifica el checksum criptográfico (ver `verifyEventChecksum`) como
   * primera defensa — si falla, se ignora el evento entero.
   */
  async handleWompiWebhook(body: {
    data?: { transaction?: { id?: string; status?: string; reference?: string } };
    signature?: { properties?: string[]; checksum?: string };
    timestamp?: number;
  }): Promise<void> {
    if (!this.wompi.verifyEventChecksum(body)) {
      return;
    }
    const transactionId = body.data?.transaction?.id;
    if (!transactionId) {
      this.logger.warn('Evento de Wompi sin transaction.id');
      return;
    }

    const transaction = await this.wompi.getTransaction(transactionId);
    const orderId = transaction.reference;
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      this.logger.warn(`Webhook de Wompi para una orden inexistente: ${orderId}`);
      return;
    }
    if (order.status !== 'PENDING') {
      // Ya procesada (PAID) o ya se dio por perdida (FAILED) — Wompi
      // puede reenviar el mismo evento más de una vez.
      return;
    }

    if (transaction.status === 'APPROVED') {
      await this.markPaid(order, transaction.id);
    } else if (TERMINAL_FAILURE_STATUSES.has(transaction.status)) {
      await this.markFailed(order);
    }
    // 'PENDING': todavía no hay nada que hacer, se espera el próximo evento.
  }

  private async markPaid(
    order: {
      id: string;
      userId: string;
      zoneId: string;
      reservationId: string;
      quantity: number;
      seatIds?: string[];
    },
    wompiTransactionId: string,
  ): Promise<void> {
    const eventId = randomUUID();
    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: order.id },
        data: { status: 'PAID', wompiTransactionId },
      }),
      this.prisma.outboxEvent.create({
        data: {
          id: eventId,
          type: EVENT_TYPES.ORDER_PAID,
          payload: {
            orderId: order.id,
            userId: order.userId,
            zoneId: order.zoneId,
            reservationId: order.reservationId,
            quantity: order.quantity,
            ...(order.seatIds && order.seatIds.length > 0 && { seatIds: order.seatIds }),
          },
        },
      }),
    ]);
  }

  private async markFailed(order: { id: string; reservationId: string }): Promise<void> {
    await this.prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
    // El webhook no tiene ningún request de usuario final del cual
    // reenviar un header firmado — ver system-headers.ts.
    await this.ticketsClient.release(order.reservationId, buildSystemHeaders(this.config)).catch((err) => {
      this.logger.warn(`No se pudo liberar la reserva ${order.reservationId} tras pago fallido: ${err.message}`);
    });
  }

  findByUser(userId: string) {
    return this.prisma.order.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }
}
