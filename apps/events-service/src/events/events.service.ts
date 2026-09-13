import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InternalUserContext } from '@event-hub/internal-auth';
import { EVENT_TYPES } from '@event-hub/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventsPublisher } from '../messaging/domain-events.publisher';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: DomainEventsPublisher,
  ) {}

  async create(dto: CreateEventDto, organizerId: string) {
    const event = await this.prisma.event.create({
      data: {
        title: dto.title,
        description: dto.description,
        venue: dto.venue,
        startsAt: new Date(dto.startsAt),
        organizerId,
        zones: {
          create: dto.zones.map((zone) => ({
            name: zone.name,
            price: zone.price,
            capacity: zone.capacity,
          })),
        },
      },
      include: { zones: true },
    });

    await this.publisher.publish(EVENT_TYPES.EVENT_CREATED, event);

    return event;
  }

  findAll() {
    return this.prisma.event.findMany({
      include: { zones: true },
      orderBy: { startsAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: { zones: true },
    });
    if (!event) {
      throw new NotFoundException(`Evento ${id} no encontrado`);
    }
    return event;
  }

  async update(id: string, dto: UpdateEventDto, requester: InternalUserContext) {
    const existing = await this.findOne(id); // 404 si no existe

    const isOwner = existing.organizerId === requester.userId;
    const isSuperAdmin = requester.roles.includes('SUPER_ADMIN');
    if (!isOwner && !isSuperAdmin) {
      throw new ForbiddenException('Solo el organizador dueño del evento puede editarlo');
    }

    const event = await this.prisma.event.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.venue !== undefined && { venue: dto.venue }),
        ...(dto.startsAt !== undefined && { startsAt: new Date(dto.startsAt) }),
      },
      include: { zones: true },
    });

    await this.publisher.publish(EVENT_TYPES.EVENT_UPDATED, event);

    return event;
  }
}
