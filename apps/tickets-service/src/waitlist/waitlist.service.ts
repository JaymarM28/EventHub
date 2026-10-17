import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EVENT_TYPES } from '@event-hub/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventsPublisher } from '../messaging/domain-events.publisher';

/**
 * #11 (2026-09-30) — captura la demanda que hoy se pierde en silencio
 * cuando una zona se agota. Sin "hold" reservado para nadie en esta v1
 * (decisión de simplicidad, ver comentario en WaitlistEntry): el aviso le
 * avisa primero a quien está en la lista, pero compra en igualdad de
 * condiciones que cualquier otro comprador — no hay una ventana exclusiva.
 */
@Injectable()
export class WaitlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: DomainEventsPublisher,
  ) {}

  /** Rechaza anotarse si la zona todavía tiene cupo real — una lista de
   * espera para algo que SÍ se puede comprar ahora no tiene sentido, y
   * confundiría al comprador (ver mismo filtro `refundedAt: null` que el
   * fix de capacidad en ReservationsService/TicketsService). */
  async join(zoneId: string, userId: string) {
    const zone = await this.prisma.eventZone.findUnique({ where: { id: zoneId } });
    if (!zone) {
      throw new NotFoundException(`Zona ${zoneId} no encontrada`);
    }

    const soldCount = await this.prisma.ticket.count({ where: { zoneId, refundedAt: null } });
    if (soldCount < zone.capacity) {
      throw new BadRequestException(
        'Esta zona todavía tiene cupo disponible — no hace falta anotarte en la lista de espera',
      );
    }

    return this.prisma.waitlistEntry.upsert({
      where: { zoneId_userId: { zoneId, userId } },
      create: { zoneId, userId },
      update: {}, // ya estaba anotado — no-op, no reinicia su turno (createdAt)
    });
  }

  async leave(zoneId: string, userId: string): Promise<void> {
    await this.prisma.waitlistEntry.deleteMany({ where: { zoneId, userId } });
  }

  async status(zoneId: string, userId: string): Promise<{ waiting: boolean; notified: boolean }> {
    const entry = await this.prisma.waitlistEntry.findUnique({
      where: { zoneId_userId: { zoneId, userId } },
    });
    return { waiting: entry !== null, notified: entry?.notifiedAt != null };
  }

  /**
   * Llamado desde TicketsService.refundByOrder cuando un reembolso libera
   * cupo real. FIFO por `createdAt`: los primeros `freedCount` que
   * todavía no fueron avisados se llevan el aviso — un evento de dominio
   * POR PERSONA (mismo criterio que order.paid buyer/organizer) para que
   * cada uno tenga su propia idempotencia en notifications-service.
   */
  async notifyFreedSlots(zoneId: string, freedCount: number): Promise<void> {
    if (freedCount <= 0) return;

    const entries = await this.prisma.waitlistEntry.findMany({
      where: { zoneId, notifiedAt: null },
      orderBy: { createdAt: 'asc' },
      take: freedCount,
    });

    for (const entry of entries) {
      await this.prisma.waitlistEntry.update({
        where: { id: entry.id },
        data: { notifiedAt: new Date() },
      });
      await this.publisher.publish(EVENT_TYPES.WAITLIST_SLOT_AVAILABLE, {
        userId: entry.userId,
        zoneId,
      });
    }
  }
}
