import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  InternalUser,
  InternalUserContext,
  Public,
  Roles,
} from '@event-hub/internal-auth';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

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

  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
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
}
