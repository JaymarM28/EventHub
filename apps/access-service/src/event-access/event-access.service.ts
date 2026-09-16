import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Read-model local de "quién puede escanear qué evento" — ver el
 * comentario del modelo EventAccess en schema.prisma. Nunca se llama en
 * el camino síncrono hacia events-service; solo se alimenta de los
 * eventos de dominio que consume EventAccessConsumer.
 */
@Injectable()
export class EventAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async grant(eventId: string, userId: string): Promise<void> {
    await this.prisma.eventAccess.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId },
      update: {},
    });
  }

  async isAuthorized(eventId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.eventAccess.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    return row !== null;
  }
}
