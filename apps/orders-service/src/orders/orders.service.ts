import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RawInternalHeaders } from '@event-hub/internal-auth';
import { EVENT_TYPES } from '@event-hub/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { TicketsClientService } from './tickets-client.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketsClient: TicketsClientService,
    private readonly payments: PaymentsService,
  ) {}

  async checkout(zoneId: string, quantity: number, userId: string, headers: RawInternalHeaders) {
    // 1. Reserva síncrona en tickets-service (Finding 1) — falla rápido si
    //    la zona no tiene `quantity` cupos, antes de crear cualquier
    //    registro de orden.
    const reservation = await this.ticketsClient.reserve(zoneId, quantity, headers);
    // reservation.price es UNITARIO — el monto de la orden es el total.
    const totalAmount = reservation.price * reservation.quantity;

    const order = await this.prisma.order.create({
      data: {
        userId,
        zoneId: reservation.zoneId,
        reservationId: reservation.reservationId,
        quantity: reservation.quantity,
        amount: totalAmount,
        status: 'PENDING',
      },
    });

    // 2. Pago (simulado por ahora — ver payments.service.ts).
    const payment = await this.payments.charge(totalAmount);

    if (!payment.success) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: 'FAILED' },
      });
      await this.ticketsClient.release(reservation.reservationId, headers).catch((err) => {
        this.logger.warn(
          `No se pudo liberar la reserva ${reservation.reservationId} tras pago fallido: ${err.message}`,
        );
      });
      throw new HttpException('El pago fue rechazado', HttpStatus.PAYMENT_REQUIRED);
    }

    // 3. Outbox transaccional (premisa 8): el pago se confirma y el evento
    //    a publicar se escriben en la MISMA transacción — un fallo de
    //    RabbitMQ después de este punto nunca pierde el order.paid, el
    //    poller (OutboxService) lo reintenta hasta publicarlo.
    const eventId = randomUUID();
    await this.prisma.$transaction([
      this.prisma.order.update({ where: { id: order.id }, data: { status: 'PAID' } }),
      this.prisma.outboxEvent.create({
        data: {
          id: eventId,
          type: EVENT_TYPES.ORDER_PAID,
          payload: {
            orderId: order.id,
            userId,
            zoneId: reservation.zoneId,
            reservationId: reservation.reservationId,
            quantity: reservation.quantity,
          },
        },
      }),
    ]);

    return { ...order, status: 'PAID' as const };
  }

  findByUser(userId: string) {
    return this.prisma.order.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }
}
