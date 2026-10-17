import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertPayoutAccountDto } from './dto/upsert-payout-account.dto';

/**
 * #24 (modelo de negocio, TODOS.md #13) — la mitad "salida" del cargo por
 * servicio: cuánto se le debe a cada organizador (sus órdenes PAID menos
 * el cargo por servicio, que es ingreso de la plataforma) y cómo se
 * liquida. `zoneIds` los resuelve SIEMPRE el caller (admin panel, vía
 * events-service) — mismo criterio que `OrdersService.findByZones`/
 * `refund`, este servicio no sabe qué zona es de qué organizador.
 *
 * La liquidación es MANUAL por ahora: agrupa órdenes en un `Payout` y las
 * marca liquidadas, pero no dispara ninguna transferencia real — Wompi
 * tiene una API de Payouts real (ver TODOS.md #13) pero sus fees/límites
 * no están confirmados todavía, así que automatizar el envío de plata
 * queda pendiente de esa conversación con Wompi.
 */
@Injectable()
export class PayoutsService {
  /// Colchón contra reembolsos tardíos (2026-10-17, ver "Cons" en TODOS.md
  /// #13): una orden PAID recién cuenta para liquidación N días después de
  /// pagada. Sin esto, liquidar el mismo día que se cobró deja a la
  /// plataforma cubriendo de su bolsillo cualquier reembolso que llegue
  /// después — el mismo "rolling reserve" que usan las pasarelas reales.
  private readonly holdDays: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.holdDays = Number(config.get<string>('PAYOUT_HOLD_DAYS') ?? '5');
  }

  getAccount(organizerId: string) {
    return this.prisma.organizerPayoutAccount.findUnique({ where: { organizerId } });
  }

  upsertAccount(organizerId: string, dto: UpsertPayoutAccountDto) {
    return this.prisma.organizerPayoutAccount.upsert({
      where: { organizerId },
      create: { organizerId, ...dto },
      update: { ...dto },
    });
  }

  private settleableSince(): Date {
    return new Date(Date.now() - this.holdDays * 24 * 60 * 60 * 1000);
  }

  /** Suma de (amount - serviceFeeAmount) de las órdenes PAID de estas zonas
   * que todavía no se agruparon en un Payout y ya pasaron el colchón de
   * `holdDays`. */
  async pendingSummary(zoneIds: string[]): Promise<{ pendingAmount: string; ordersCount: number }> {
    if (zoneIds.length === 0) return { pendingAmount: '0', ordersCount: 0 };
    const orders = await this.prisma.order.findMany({
      where: {
        zoneId: { in: zoneIds },
        status: 'PAID',
        payoutId: null,
        createdAt: { lte: this.settleableSince() },
      },
      select: { amount: true, serviceFeeAmount: true },
    });
    const pendingAmount = orders.reduce((sum, o) => sum + Number(o.amount) - Number(o.serviceFeeAmount), 0);
    return { pendingAmount: pendingAmount.toFixed(2), ordersCount: orders.length };
  }

  listPayouts(organizerId: string) {
    return this.prisma.payout.findMany({ where: { organizerId }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Cuánto generó la PLATAFORMA (no los organizadores) por cargo de
   * servicio — a diferencia de `pendingSummary`, acá no importa si la
   * orden ya se liquidó o no: el cargo de servicio es ingreso propio desde
   * el momento en que se cobra. Una orden reembolsada no cuenta (su
   * `status` deja de ser `PAID`, y el reembolso le devuelve el cargo
   * completo al comprador — ver `OrdersService.refund`).
   */
  async platformRevenue(): Promise<{
    totalRevenue: string;
    paidOrdersCount: number;
    last30DaysRevenue: string;
  }> {
    const [allTime, last30Days] = await Promise.all([
      this.prisma.order.aggregate({
        where: { status: 'PAID' },
        _sum: { serviceFeeAmount: true },
        _count: true,
      }),
      this.prisma.order.aggregate({
        where: { status: 'PAID', createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        _sum: { serviceFeeAmount: true },
      }),
    ]);
    return {
      totalRevenue: (allTime._sum.serviceFeeAmount ?? 0).toString(),
      paidOrdersCount: allTime._count,
      last30DaysRevenue: (last30Days._sum.serviceFeeAmount ?? 0).toString(),
    };
  }

  /**
   * Agrupa TODAS las órdenes PAID pendientes de liquidar de estas zonas en
   * un Payout nuevo, marcándolas liquidadas — una orden que se reembolsa
   * DESPUÉS de liquidada ya no se puede "reclamar de vuelta" acá (por eso
   * la recomendación en TODOS.md #13 de liquidar por lotes con un colchón
   * de tiempo, no inmediato por orden).
   */
  async settle(organizerId: string, zoneIds: string[], externalReference: string, notes?: string) {
    return this.prisma.$transaction(async (tx) => {
      const orders = await tx.order.findMany({
        where: {
          zoneId: { in: zoneIds },
          status: 'PAID',
          payoutId: null,
          createdAt: { lte: this.settleableSince() },
        },
      });
      if (orders.length === 0) {
        throw new BadRequestException('No hay órdenes pendientes de liquidar para este organizador');
      }

      const totalAmount = orders.reduce((sum, o) => sum + Number(o.amount) - Number(o.serviceFeeAmount), 0);

      const payout = await tx.payout.create({
        data: {
          organizerId,
          totalAmount,
          ordersCount: orders.length,
          status: 'SETTLED',
          externalReference,
          notes,
          settledAt: new Date(),
        },
      });

      await tx.order.updateMany({
        where: { id: { in: orders.map((o) => o.id) } },
        data: { payoutId: payout.id },
      });

      return payout;
    });
  }
}
