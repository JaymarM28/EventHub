import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  InternalHeaders,
  InternalUser,
  InternalUserContext,
  Public,
  RawInternalHeaders,
  Roles,
} from '@event-hub/internal-auth';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { FindEventsQueryDto } from './dto/find-events-query.dto';
import { AddStaffDto } from './dto/add-staff.dto';
import { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';
import { CreateDiscountCodeDto, UpdateDiscountCodeDto } from './dto/discount-code.dto';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @Roles('ORGANIZER', 'SUPER_ADMIN')
  create(@Body() dto: CreateEventDto, @InternalUser() user: InternalUserContext) {
    return this.eventsService.create(dto, user.userId);
  }

  @Get()
  @Public()
  findAll(@Query() query: FindEventsQueryDto) {
    return this.eventsService.findAll(query);
  }

  // Debe declararse ANTES de `:id` — Nest resuelve rutas en orden de
  // declaración, así que un `:id` ya registrado capturaría "mine" como si
  // fuera el id de un evento.
  @Get('mine')
  @Roles('ORGANIZER', 'SUPER_ADMIN')
  findMine(@InternalUser() user: InternalUserContext) {
    return this.eventsService.findByOrganizer(user.userId);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }

  @Get(':id/dashboard')
  @Roles('ORGANIZER', 'SUPER_ADMIN')
  dashboard(@Param('id') id: string, @InternalUser() user: InternalUserContext) {
    return this.eventsService.dashboard(id, user);
  }

  @Get(':id/staff')
  @Roles('ORGANIZER', 'SUPER_ADMIN')
  listStaff(@Param('id') id: string, @InternalUser() user: InternalUserContext) {
    return this.eventsService.listStaff(id, user);
  }

  @Patch(':id')
  @Roles('ORGANIZER', 'SUPER_ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
    @InternalUser() user: InternalUserContext,
  ) {
    return this.eventsService.update(id, dto, user);
  }

  @Post(':id/staff')
  @Roles('ORGANIZER', 'SUPER_ADMIN')
  addStaff(
    @Param('id') id: string,
    @Body() dto: AddStaffDto,
    @InternalUser() user: InternalUserContext,
    @InternalHeaders() headers: RawInternalHeaders,
  ) {
    return this.eventsService.addStaff(id, dto, user, headers);
  }

  @Post(':id/zones')
  @Roles('ORGANIZER', 'SUPER_ADMIN')
  addZone(@Param('id') id: string, @Body() dto: CreateZoneDto, @InternalUser() user: InternalUserContext) {
    return this.eventsService.addZone(id, dto, user);
  }

  @Patch(':id/zones/:zoneId')
  @Roles('ORGANIZER', 'SUPER_ADMIN')
  updateZone(
    @Param('id') id: string,
    @Param('zoneId') zoneId: string,
    @Body() dto: UpdateZoneDto,
    @InternalUser() user: InternalUserContext,
  ) {
    return this.eventsService.updateZone(id, zoneId, dto, user);
  }

  @Post(':id/discount-codes')
  @Roles('ORGANIZER', 'SUPER_ADMIN')
  createDiscountCode(
    @Param('id') id: string,
    @Body() dto: CreateDiscountCodeDto,
    @InternalUser() user: InternalUserContext,
  ) {
    return this.eventsService.createDiscountCode(id, dto, user);
  }

  @Get(':id/discount-codes')
  @Roles('ORGANIZER', 'SUPER_ADMIN')
  listDiscountCodes(@Param('id') id: string, @InternalUser() user: InternalUserContext) {
    return this.eventsService.listDiscountCodes(id, user);
  }

  @Patch(':id/discount-codes/:codeId')
  @Roles('ORGANIZER', 'SUPER_ADMIN')
  updateDiscountCode(
    @Param('id') id: string,
    @Param('codeId') codeId: string,
    @Body() dto: UpdateDiscountCodeDto,
    @InternalUser() user: InternalUserContext,
  ) {
    return this.eventsService.updateDiscountCode(id, codeId, dto, user);
  }
}
