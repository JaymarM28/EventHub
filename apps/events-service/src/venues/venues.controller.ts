import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '@event-hub/internal-auth';
import { VenuesService } from './venues.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { CreateVenueSectionDto, UpdateVenueSectionDto } from './dto/venue-section.dto';

/**
 * Establecimientos: catálogo de plataforma. Crear/editar es exclusivo de
 * SUPER_ADMIN; listar/ver también lo puede hacer un ORGANIZER (a futuro,
 * para elegir uno al crear su evento — ver DESIGN.md). El guard global de
 * events-service (InternalAuthGuard+RolesGuard, ver app.module.ts) ya
 * aplica a todo este controller, no hace falta repetirlo acá.
 */
@Controller('venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Post()
  @Roles('SUPER_ADMIN')
  create(@Body() dto: CreateVenueDto) {
    return this.venuesService.create(dto);
  }

  @Get()
  @Roles('SUPER_ADMIN', 'ORGANIZER')
  findAll() {
    return this.venuesService.findAll();
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ORGANIZER')
  findOne(@Param('id') id: string) {
    return this.venuesService.findOne(id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateVenueDto) {
    return this.venuesService.update(id, dto);
  }

  /** Editor del mapa de secciones — mismo permiso que crear/editar el
   * establecimiento en sí (SUPER_ADMIN, catálogo de plataforma v1). */
  @Post(':id/sections')
  @Roles('SUPER_ADMIN')
  createSection(@Param('id') id: string, @Body() dto: CreateVenueSectionDto) {
    return this.venuesService.createSection(id, dto);
  }

  @Patch(':id/sections/:sectionId')
  @Roles('SUPER_ADMIN')
  updateSection(
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: UpdateVenueSectionDto,
  ) {
    return this.venuesService.updateSection(id, sectionId, dto);
  }
}
