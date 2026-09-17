import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InternalUserContext, RawInternalHeaders } from '@event-hub/internal-auth';
import { EVENT_TYPES } from '@event-hub/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventsPublisher } from '../messaging/domain-events.publisher';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { AddStaffDto } from './dto/add-staff.dto';
import { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';
import { AuthClientService } from './auth-client.service';
import { TicketsClientService } from './tickets-client.service';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: DomainEventsPublisher,
    private readonly authClient: AuthClientService,
    private readonly ticketsClient: TicketsClientService,
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

  findByOrganizer(organizerId: string) {
    return this.prisma.event.findMany({
      where: { organizerId },
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
    this.assertOwner(existing.organizerId, requester, 'editarlo');

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
    this.assertOwner(existing.organizerId, requester, 'agregar staff');

    const createdUser = await this.authClient.createStaffUser(dto, headers);

    const eventStaff = await this.prisma.eventStaff.create({
      data: { eventId: id, userId: createdUser.id, email: createdUser.email },
    });

    await this.publisher.publish(EVENT_TYPES.EVENT_STAFF_ASSIGNED, {
      eventId: id,
      userId: createdUser.id,
    });

    return eventStaff;
  }

  async listStaff(id: string, requester: InternalUserContext) {
    const existing = await this.findOne(id); // 404 si no existe
    this.assertOwner(existing.organizerId, requester, 'ver su staff');

    return this.prisma.eventStaff.findMany({
      where: { eventId: id },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Ventas/aforo por zona para el admin panel (fase stretch de DESIGN.md).
   * `sold` viene de tickets-service (fuente de verdad de boletos emitidos)
   * — events-service solo conoce la capacidad. El ingreso se aproxima como
   * `precio × vendidos` (no hay reembolsos todavía, ver TODOS.md #13), en
   * vez de sumar montos reales de orders-service — evita una tercera
   * dependencia síncrona solo para este dashboard.
   */
  async dashboard(id: string, requester: InternalUserContext) {
    const existing = await this.findOne(id); // 404 si no existe
    this.assertOwner(existing.organizerId, requester, 'ver su dashboard');

    const sales = await this.ticketsClient.soldCountByZone(existing.zones.map((z) => z.id));
    const soldByZone = new Map(sales.map((s) => [s.zoneId, s.sold]));

    const zones = existing.zones.map((zone) => {
      const sold = soldByZone.get(zone.id) ?? 0;
      return {
        zoneId: zone.id,
        name: zone.name,
        price: zone.price,
        capacity: zone.capacity,
        sold,
        revenue: Number(zone.price) * sold,
      };
    });

    return {
      eventId: id,
      zones,
      totalCapacity: zones.reduce((sum, z) => sum + z.capacity, 0),
      totalSold: zones.reduce((sum, z) => sum + z.sold, 0),
      totalRevenue: zones.reduce((sum, z) => sum + z.revenue, 0),
    };
  }

  /**
   * Nueva zona para un evento ya publicado (admin panel). No requiere
   * chequear vendidos — una zona nueva siempre empieza en 0.
   */
  async addZone(id: string, dto: CreateZoneDto, requester: InternalUserContext) {
    const existing = await this.findOne(id); // 404 si no existe
    this.assertOwner(existing.organizerId, requester, 'agregar zonas');

    await this.prisma.zone.create({
      data: { eventId: id, name: dto.name, price: dto.price, capacity: dto.capacity },
    });

    const event = await this.findOne(id);
    await this.publisher.publish(EVENT_TYPES.EVENT_UPDATED, event);
    return event;
  }

  /**
   * Nombre y precio se editan libres — no afectan boletos ya emitidos,
   * solo ventas futuras. La capacidad es la única regla real: nunca puede
   * bajar de lo ya vendido (tickets-service es la fuente de verdad de
   * cuántos boletos existen de esa zona) — bajarla rompería la garantía
   * dura contra sobreventa (SELECT...FOR UPDATE en tickets-service, ver
   * DESIGN.md premisa 6). Subirla, o dejarla igual, siempre es seguro.
   */
  async updateZone(id: string, zoneId: string, dto: UpdateZoneDto, requester: InternalUserContext) {
    const existing = await this.findOne(id); // 404 si no existe
    this.assertOwner(existing.organizerId, requester, 'editar sus zonas');

    const zone = existing.zones.find((z) => z.id === zoneId);
    if (!zone) {
      throw new NotFoundException(`Zona ${zoneId} no encontrada en este evento`);
    }

    if (dto.capacity !== undefined) {
      const [sales] = await this.ticketsClient.soldCountByZone([zoneId]);
      const sold = sales?.sold ?? 0;
      if (dto.capacity < sold) {
        throw new BadRequestException(
          `No se puede bajar la capacidad a ${dto.capacity} — ya se vendieron ${sold} boletos de esta zona`,
        );
      }
    }

    await this.prisma.zone.update({
      where: { id: zoneId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
      },
    });

    const event = await this.findOne(id);
    await this.publisher.publish(EVENT_TYPES.EVENT_UPDATED, event);
    return event;
  }

  private assertOwner(organizerId: string, requester: InternalUserContext, action: string): void {
    const isOwner = organizerId === requester.userId;
    const isSuperAdmin = requester.roles.includes('SUPER_ADMIN');
    if (!isOwner && !isSuperAdmin) {
      throw new ForbiddenException(`Solo el organizador dueño del evento puede ${action}`);
    }
  }
}
