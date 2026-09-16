import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
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
import { AddStaffDto } from './dto/add-staff.dto';

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
  findAll() {
    return this.eventsService.findAll();
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
}
