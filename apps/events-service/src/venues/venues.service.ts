import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { CreateVenueSectionDto, UpdateVenueSectionDto } from './dto/venue-section.dto';

/**
 * Catálogo de plataforma, administrado por SUPER_ADMIN (ver
 * VenuesController). No hay `delete` a propósito — mismo criterio que las
 * zonas de un evento (events.service.ts): más simple no tener que pensar
 * qué pasa si un establecimiento en uso desaparece, sobre todo antes de
 * que exista la integración real con Event (Fase de plataforma, v1).
 */
@Injectable()
export class VenuesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateVenueDto) {
    return this.prisma.venue.create({ data: dto });
  }

  findAll() {
    return this.prisma.venue.findMany({ orderBy: { name: 'asc' } });
  }

  /**
   * Incluye `sections` a propósito: quien pide un establecimiento (admin
   * panel para armar el editor del mapa, o el organizador al crear zonas)
   * casi siempre necesita el mapa completo, no solo los datos base — evita
   * un segundo viaje a `GET /venues/:id/sections`.
   */
  async findOne(id: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id },
      include: { sections: true },
    });
    if (!venue) {
      throw new NotFoundException(`Establecimiento ${id} no existe`);
    }
    return venue;
  }

  async update(id: string, dto: UpdateVenueDto) {
    await this.findOne(id);
    return this.prisma.venue.update({ where: { id }, data: dto });
  }

  async createSection(venueId: string, dto: CreateVenueSectionDto) {
    await this.findOne(venueId); // 404 si el venue no existe
    return this.prisma.venueSection.create({
      data: {
        venueId,
        name: dto.name,
        points: dto.points as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async updateSection(venueId: string, sectionId: string, dto: UpdateVenueSectionDto) {
    await this.findSectionOrThrow(venueId, sectionId);
    return this.prisma.venueSection.update({
      where: { id: sectionId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.points !== undefined ? { points: dto.points as unknown as Prisma.InputJsonValue } : {}),
      },
    });
  }

  /**
   * Sin `delete` a propósito, mismo criterio documentado arriba para
   * Venue: más simple no tener que decidir qué pasa con una Zone que ya
   * apunta a esta sección (Zone.venueSectionId quedaría huérfano). Si hace
   * falta "borrar" una sección, se puede vaciar su nombre/puntos vía
   * `update` sin romper la referencia.
   */
  private async findSectionOrThrow(venueId: string, sectionId: string) {
    const section = await this.prisma.venueSection.findUnique({ where: { id: sectionId } });
    if (!section || section.venueId !== venueId) {
      throw new NotFoundException(`Sección ${sectionId} no existe en el establecimiento ${venueId}`);
    }
    return section;
  }
}
