import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';

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

  async findOne(id: string) {
    const venue = await this.prisma.venue.findUnique({ where: { id } });
    if (!venue) {
      throw new NotFoundException(`Establecimiento ${id} no existe`);
    }
    return venue;
  }

  async update(id: string, dto: UpdateVenueDto) {
    await this.findOne(id);
    return this.prisma.venue.update({ where: { id }, data: dto });
  }
}
