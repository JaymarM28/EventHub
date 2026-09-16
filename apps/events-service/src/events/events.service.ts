import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InternalUserContext, RawInternalHeaders } from '@event-hub/internal-auth';
import { EVENT_TYPES } from '@event-hub/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventsPublisher } from '../messaging/domain-events.publisher';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { AddStaffDto } from './dto/add-staff.dto';
import { AuthClientService } from './auth-client.service';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: DomainEventsPublisher,
    private readonly authClient: AuthClientService,
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

  /**
   * Da de alta a alguien del equipo de STAFF del evento — mismo chequeo de
   * ownership que `update()` (dueño del evento o SUPER_ADMIN), nunca por
   * rol global únicamente (TODOS.md #4). Crea la cuenta en auth-service
   * (con contraseña que define el organizador, decisión explícita — ver
   * TODOS.md), guarda la relación evento↔staff acá, y emite
   * event.staff-assigned para que access-service la sincronice sin
   * depender en vivo de events-service en el camino del escaneo.
   */
  async addStaff(id: string, dto: AddStaffDto, requester: InternalUserContext, headers: RawInternalHeaders) {
    const existing = await this.findOne(id); // 404 si no existe

    const isOwner = existing.organizerId === requester.userId;
    const isSuperAdmin = requester.roles.includes('SUPER_ADMIN');
    if (!isOwner && !isSuperAdmin) {
      throw new ForbiddenException('Solo el organizador dueño del evento puede agregar staff');
    }

    const createdUser = await this.authClient.createStaffUser(dto, headers);

    const eventStaff = await this.prisma.eventStaff.create({
      data: { eventId: id, userId: createdUser.id },
    });

    await this.publisher.publish(EVENT_TYPES.EVENT_STAFF_ASSIGNED, {
      eventId: id,
      userId: createdUser.id,
    });

    return { id: eventStaff.id, eventId: id, userId: createdUser.id, email: createdUser.email };
  }
}
