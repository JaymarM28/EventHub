import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InternalUserContext, RawInternalHeaders } from '@event-hub/internal-auth';
import { EVENT_TYPES } from '@event-hub/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventsPublisher } from '../messaging/domain-events.publisher';
import { Prisma } from '../../generated/prisma-client';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { FindEventsQueryDto } from './dto/find-events-query.dto';
import { AddStaffDto } from './dto/add-staff.dto';
import { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';
import { GenerateSeatsDto } from './dto/generate-seats.dto';
import { CreateDiscountCodeDto, UpdateDiscountCodeDto } from './dto/discount-code.dto';
import { AuthClientService } from './auth-client.service';
import { TicketsClientService } from './tickets-client.service';
import { GeocodingService } from './geocoding.service';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: DomainEventsPublisher,
    private readonly authClient: AuthClientService,
    private readonly ticketsClient: TicketsClientService,
    private readonly geocoding: GeocodingService,
  ) {}

  async create(dto: CreateEventDto, organizerId: string) {
    // Best-effort (ver GeocodingService) — un fallo acá nunca bloquea la
    // creación del evento, solo lo deja sin mapa.
    const point = await this.geocoding.geocode(dto.venue, dto.city);

    if (dto.venueId !== undefined) {
      await this.assertVenueExists(dto.venueId);
    }
    for (const zone of dto.zones) {
      if (zone.venueSectionId !== undefined) {
        await this.assertSectionBelongsToVenue(zone.venueSectionId, dto.venueId);
      }
    }

    const event = await this.prisma.event.create({
      data: {
        title: dto.title,
        description: dto.description,
        venue: dto.venue,
        ...(dto.venueId !== undefined && { venueId: dto.venueId }),
        city: dto.city,
        category: dto.category,
        ...(dto.currency !== undefined && { currency: dto.currency }),
        startsAt: new Date(dto.startsAt),
        organizerId,
        ...(dto.coverImageUrl !== undefined && { coverImageUrl: dto.coverImageUrl }),
        ...(dto.galleryImageUrls !== undefined && { galleryImageUrls: dto.galleryImageUrls }),
        ...(point && { latitude: point.latitude, longitude: point.longitude, address: point.address }),
        zones: {
          create: dto.zones.map((zone) => ({
            name: zone.name,
            price: zone.price,
            capacity: zone.capacity,
            ...(zone.venueSectionId !== undefined && { venueSectionId: zone.venueSectionId }),
          })),
        },
      },
      include: { zones: true },
    });

    await this.publisher.publish(EVENT_TYPES.EVENT_CREATED, event);

    return event;
  }

  private async assertVenueExists(venueId: string) {
    const venue = await this.prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) {
      throw new NotFoundException(`Establecimiento ${venueId} no existe`);
    }
  }

  /**
   * Una zona solo puede vincularse a una sección del mismo Venue del
   * evento — no hay FK que lo garantice a nivel de base (Zone → VenueSection
   * → Venue, sin pasar por Event), así que se valida acá. Requiere
   * `eventVenueId` explícito en vez de resolverlo de la Zone porque se usa
   * tanto al crear el evento (el venueId recién se está por guardar) como
   * al agregar/editar una zona sobre un evento ya existente.
   */
  private async assertSectionBelongsToVenue(venueSectionId: string, eventVenueId: string | null | undefined) {
    if (!eventVenueId) {
      throw new BadRequestException(
        'Este evento no tiene un establecimiento del catálogo asignado — no se puede vincular una sección del mapa',
      );
    }
    const section = await this.prisma.venueSection.findUnique({ where: { id: venueSectionId } });
    if (!section || section.venueId !== eventVenueId) {
      throw new NotFoundException(`Sección ${venueSectionId} no existe en el establecimiento de este evento`);
    }
  }

  /**
   * Fase C (#19): todos los filtros son opcionales y se combinan con AND
   * — sin ninguno, se comporta igual que antes. `maxPrice` filtra por
   * "tiene alguna zona a ese precio o menos" (ver comentario del DTO).
   */
  /**
   * `popularity` (pedido del usuario 2026-09-28: el carrusel de destacados
   * de la app debe ordenar por popularidad real, no solo por fecha más
   * próxima) = total de boletos vendidos entre todas las zonas del evento.
   * Reusa `TicketsClientService.soldCountByZone` (ya existente para el
   * dashboard del organizador) con UN solo request batcheado para todos
   * los eventos del listado, en vez de uno por evento. Mismo criterio de
   * "no crítico" que el dashboard: si tickets-service no responde, todos
   * quedan en popularity 0 (el mobile cae de vuelta a orden por fecha).
   */
  async findAll(query: FindEventsQueryDto = {}) {
    const where: Prisma.EventWhereInput = {
      ...(query.city && { city: { equals: query.city, mode: 'insensitive' } }),
      ...(query.category && { category: query.category }),
      ...((query.fromDate || query.toDate) && {
        startsAt: {
          ...(query.fromDate && { gte: new Date(query.fromDate) }),
          ...(query.toDate && { lte: new Date(query.toDate) }),
        },
      }),
      ...(query.maxPrice !== undefined && {
        zones: { some: { price: { lte: query.maxPrice } } },
      }),
    };

    const events = await this.prisma.event.findMany({
      where,
      include: { zones: true },
      orderBy: { startsAt: 'asc' },
    });

    const zoneIds = events.flatMap((event) => event.zones.map((z) => z.id));
    const sales = await this.ticketsClient.soldCountByZone(zoneIds);
    const soldByZone = new Map(sales.map((s) => [s.zoneId, s.sold]));

    return events.map((event) => ({
      ...event,
      popularity: event.zones.reduce((sum, z) => sum + (soldByZone.get(z.id) ?? 0), 0),
    }));
  }

  findByOrganizer(organizerId: string) {
    return this.prisma.event.findMany({
      where: { organizerId },
      include: { zones: true },
      orderBy: { startsAt: 'asc' },
    });
  }

  /**
   * Incluye `venueRef.sections` a propósito, a diferencia de `findAll`/
   * `findByOrganizer` (listados) — la vista de detalle es la que necesita
   * el mapa completo para renderizarlo; una lista de eventos no.
   */
  async findOne(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: { zones: true, venueRef: { include: { sections: true } } },
    });
    if (!event) {
      throw new NotFoundException(`Evento ${id} no encontrado`);
    }
    return event;
  }

  async update(id: string, dto: UpdateEventDto, requester: InternalUserContext) {
    const existing = await this.findOne(id); // 404 si no existe
    this.assertOwner(existing.organizerId, requester, 'editarlo');

    if (dto.venueId !== undefined) {
      await this.assertVenueExists(dto.venueId);
    }

    // Re-geocodificar solo si venue/city cambiaron — evita gastar el
    // presupuesto de rate-limit de Nominatim en ediciones que no mueven la
    // ubicación (ej. cambiar solo la descripción).
    const venueChanged = dto.venue !== undefined && dto.venue !== existing.venue;
    const cityChanged = dto.city !== undefined && dto.city !== existing.city;
    const point =
      venueChanged || cityChanged
        ? await this.geocoding.geocode(dto.venue ?? existing.venue, dto.city ?? existing.city ?? '')
        : null;

    const event = await this.prisma.event.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.venue !== undefined && { venue: dto.venue }),
        ...(dto.venueId !== undefined && { venueId: dto.venueId }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.startsAt !== undefined && { startsAt: new Date(dto.startsAt) }),
        ...(dto.coverImageUrl !== undefined && { coverImageUrl: dto.coverImageUrl }),
        ...(dto.galleryImageUrls !== undefined && { galleryImageUrls: dto.galleryImageUrls }),
        ...(point && { latitude: point.latitude, longitude: point.longitude, address: point.address }),
      },
      include: { zones: true, venueRef: { include: { sections: true } } },
    });

    await this.publisher.publish(EVENT_TYPES.EVENT_UPDATED, event);

    return event;
  }

  /**
   * #22 — cancela el evento y dispara el reembolso en bloque de TODAS sus
   * órdenes pagadas (orders-service consume event.cancelled — ver
   * OrdersEventsConsumer). Sin reversión: no hay "descancelar" en esta
   * versión, mismo criterio de simplicidad que "sin delete" en otros
   * recursos del proyecto (Venue, VenueSection).
   */
  async cancel(id: string, requester: InternalUserContext) {
    const existing = await this.findOne(id); // 404 si no existe
    this.assertOwner(existing.organizerId, requester, 'cancelarlo');

    if (existing.cancelledAt) {
      throw new BadRequestException('Este evento ya está cancelado');
    }

    const event = await this.prisma.event.update({
      where: { id },
      data: { cancelledAt: new Date() },
      include: { zones: true },
    });

    await this.publisher.publish(EVENT_TYPES.EVENT_CANCELLED, {
      id: event.id,
      organizerId: event.organizerId,
      zoneIds: event.zones.map((z) => z.id),
    });

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

    const zoneIds = existing.zones.map((z) => z.id);
    const [sales, salesByDay] = await Promise.all([
      this.ticketsClient.soldCountByZone(zoneIds),
      this.ticketsClient.salesByDay(zoneIds),
    ]);
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

    // Agrega el conteo por-zona-por-día en un timeline por-día para el
    // gráfico del dashboard — el ingreso por día se aproxima igual que el
    // ingreso por zona (precio × vendidos), mismo criterio de arriba.
    const priceByZone = new Map(existing.zones.map((z) => [z.id, Number(z.price)]));
    const byDay = new Map<string, { sold: number; revenue: number }>();
    for (const row of salesByDay) {
      const price = priceByZone.get(row.zoneId) ?? 0;
      const entry = byDay.get(row.day) ?? { sold: 0, revenue: 0 };
      entry.sold += row.count;
      entry.revenue += price * row.count;
      byDay.set(row.day, entry);
    }
    const salesTimeline = Array.from(byDay.entries())
      .map(([day, v]) => ({ day, sold: v.sold, revenue: v.revenue }))
      .sort((a, b) => a.day.localeCompare(b.day));

    return {
      eventId: id,
      zones,
      totalCapacity: zones.reduce((sum, z) => sum + z.capacity, 0),
      totalSold: zones.reduce((sum, z) => sum + z.sold, 0),
      totalRevenue: zones.reduce((sum, z) => sum + z.revenue, 0),
      salesTimeline,
    };
  }

  /**
   * Nueva zona para un evento ya publicado (admin panel). No requiere
   * chequear vendidos — una zona nueva siempre empieza en 0.
   */
  async addZone(id: string, dto: CreateZoneDto, requester: InternalUserContext) {
    const existing = await this.findOne(id); // 404 si no existe
    this.assertOwner(existing.organizerId, requester, 'agregar zonas');

    if (dto.venueSectionId !== undefined) {
      await this.assertSectionBelongsToVenue(dto.venueSectionId, existing.venueId);
    }

    await this.prisma.zone.create({
      data: {
        eventId: id,
        name: dto.name,
        price: dto.price,
        capacity: dto.capacity,
        ...(dto.venueSectionId !== undefined && { venueSectionId: dto.venueSectionId }),
      },
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

    if (dto.venueSectionId !== undefined) {
      await this.assertSectionBelongsToVenue(dto.venueSectionId, existing.venueId);
    }

    await this.prisma.zone.update({
      where: { id: zoneId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
        ...(dto.venueSectionId !== undefined && { venueSectionId: dto.venueSectionId }),
      },
    });

    const event = await this.findOne(id);
    await this.publisher.publish(EVENT_TYPES.EVENT_UPDATED, event);
    return event;
  }

  /**
   * Fase 2 (asiento individual): genera el catálogo completo de butacas
   * de una zona de una sola vez. Sin `delete`/regenerar a propósito (mismo
   * criterio que Venue/VenueSection) — si hace falta cambiar el trazado,
   * es más simple crear una zona nueva que mutar butacas que ya podrían
   * tener boletos vendidos en tickets-service.
   */
  async generateSeats(id: string, zoneId: string, dto: GenerateSeatsDto, requester: InternalUserContext) {
    const existing = await this.findOne(id); // 404 si no existe
    this.assertOwner(existing.organizerId, requester, 'generar butacas');

    const zone = existing.zones.find((z) => z.id === zoneId);
    if (!zone) {
      throw new NotFoundException(`Zona ${zoneId} no encontrada en este evento`);
    }

    const alreadyHasSeats = await this.prisma.seat.count({ where: { zoneId } });
    if (alreadyHasSeats > 0) {
      throw new BadRequestException(
        'Esta zona ya tiene butacas generadas — no se puede regenerar (crear una zona nueva si el trazado cambió)',
      );
    }

    const totalSeats = dto.rowLabels.length * dto.seatsPerRow;
    if (totalSeats > zone.capacity) {
      throw new BadRequestException(
        `${totalSeats} butacas superan el cupo de la zona (${zone.capacity}) — ajustá el cupo o la cantidad de filas/asientos`,
      );
    }

    await this.prisma.seat.createMany({
      data: dto.rowLabels.flatMap((rowLabel) =>
        Array.from({ length: dto.seatsPerRow }, (_, i) => ({ zoneId, rowLabel, seatNumber: i + 1 })),
      ),
    });

    // A diferencia de create/addZone/updateZone, este publish SÍ necesita
    // las butacas en el payload — es el único cambio que le importa a
    // tickets-service.ZonesSyncConsumer para poblar su copia local de
    // Seat. El resto de los flujos de evento.updated no las incluyen a
    // propósito (ver findOne) para no sobre-pedir en cada fetch de evento.
    const eventWithSeats = await this.prisma.event.findUniqueOrThrow({
      where: { id },
      include: { zones: { include: { seats: true } } },
    });
    await this.publisher.publish(EVENT_TYPES.EVENT_UPDATED, eventWithSeats);

    return this.findOne(id);
  }

  /** #23 — código en mayúsculas siempre (evita que "AMIGOS20" y
   * "amigos20" convivan como códigos distintos del mismo evento por un
   * despiste de tipeo). */
  async createDiscountCode(id: string, dto: CreateDiscountCodeDto, requester: InternalUserContext) {
    const event = await this.findOne(id); // 404 si no existe
    this.assertOwner(event.organizerId, requester, 'crear códigos de descuento');

    if (dto.type === 'PERCENTAGE' && (dto.value <= 0 || dto.value > 100)) {
      throw new BadRequestException('Un descuento por porcentaje debe estar entre 0 y 100');
    }
    if (dto.type === 'FIXED' && dto.value <= 0) {
      throw new BadRequestException('Un descuento de monto fijo debe ser mayor a 0');
    }

    const code = dto.code.toUpperCase();
    const existing = await this.prisma.discountCode.findUnique({
      where: { eventId_code: { eventId: id, code } },
    });
    if (existing) {
      throw new BadRequestException(`Ya existe un código "${code}" para este evento`);
    }

    return this.prisma.discountCode.create({
      data: { eventId: id, code, type: dto.type, value: dto.value, maxUses: dto.maxUses },
    });
  }

  async listDiscountCodes(id: string, requester: InternalUserContext) {
    const event = await this.findOne(id); // 404 si no existe
    this.assertOwner(event.organizerId, requester, 'ver los códigos de descuento');
    return this.prisma.discountCode.findMany({ where: { eventId: id }, orderBy: { createdAt: 'desc' } });
  }

  /** Solo permite desactivar o cambiar el tope de usos — el tipo/valor de
   * un código NO se edita una vez creado (evita el caso raro de cambiar
   * las reglas de un código que alguien ya tiene guardado a mitad de
   * canje); si el organizador se equivocó, borra el código y crea uno
   * nuevo. */
  async updateDiscountCode(id: string, codeId: string, dto: UpdateDiscountCodeDto, requester: InternalUserContext) {
    const event = await this.findOne(id); // 404 si no existe
    this.assertOwner(event.organizerId, requester, 'editar los códigos de descuento');

    const code = await this.prisma.discountCode.findFirst({ where: { id: codeId, eventId: id } });
    if (!code) {
      throw new NotFoundException(`Código ${codeId} no encontrado en este evento`);
    }

    return this.prisma.discountCode.update({
      where: { id: codeId },
      data: {
        ...(dto.maxUses !== undefined && { maxUses: dto.maxUses }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });
  }

  /**
   * Llamado por orders-service durante el checkout — NUNCA vía gateway.
   * Canje ATÓMICO: `SELECT ... FOR UPDATE` dentro de una transacción,
   * mismo patrón que la reserva de zonas en tickets-service, para que dos
   * checkouts concurrentes usando el último cupo del código no lo dejen
   * en negativo (`usedCount > maxUses`).
   */
  async redeemDiscountCode(zoneId: string, rawCode: string) {
    const code = rawCode.toUpperCase();
    return this.prisma.$transaction(async (tx) => {
      const zone = await tx.zone.findUnique({ where: { id: zoneId }, select: { eventId: true, price: true } });
      if (!zone) {
        throw new NotFoundException(`Zona ${zoneId} no existe`);
      }

      const rows = await tx.$queryRaw<
        { id: string; type: 'PERCENTAGE' | 'FIXED'; value: Prisma.Decimal; maxUses: number | null; usedCount: number; active: boolean }[]
      >`SELECT id, type, value, "maxUses", "usedCount", active FROM discount_codes
        WHERE "eventId" = ${zone.eventId} AND code = ${code} FOR UPDATE`;
      const discount = rows[0];
      if (!discount || !discount.active) {
        throw new BadRequestException('Código de descuento inválido');
      }
      if (discount.maxUses !== null && discount.usedCount >= discount.maxUses) {
        throw new BadRequestException('Este código de descuento ya alcanzó su límite de usos');
      }

      await tx.discountCode.update({ where: { id: discount.id }, data: { usedCount: { increment: 1 } } });

      return { type: discount.type, value: discount.value.toString(), zonePrice: zone.price.toString() };
    });
  }

  /**
   * Fase B (notificaciones reales al organizador): orders-service solo
   * conoce el `zoneId` de la compra, no a quién pertenece el evento —
   * notifications-service necesita este salto para poder avisarle al
   * organizador de una venta nueva. Llamada interna, nunca vía gateway.
   */
  async findZoneWithOrganizer(zoneId: string) {
    const zone = await this.prisma.zone.findUnique({
      where: { id: zoneId },
      include: {
        event: {
          select: { id: true, title: true, organizerId: true, venue: true, city: true, startsAt: true, currency: true },
        },
      },
    });
    if (!zone) {
      throw new NotFoundException(`Zona ${zoneId} no existe`);
    }
    return {
      eventId: zone.event.id,
      eventTitle: zone.event.title,
      organizerId: zone.event.organizerId,
      // Fase B/#correo de compra: se agregan acá (en vez de un endpoint
      // nuevo en orders-service) para armar el correo de confirmación sin
      // otro salto de red — notifications-service ya llama a esto mismo
      // para el aviso al organizador.
      venue: zone.event.venue,
      city: zone.event.city,
      startsAt: zone.event.startsAt,
      currency: zone.event.currency,
      zoneName: zone.name,
      zonePrice: zone.price.toString(),
    };
  }

  private assertOwner(organizerId: string, requester: InternalUserContext, action: string): void {
    const isOwner = organizerId === requester.userId;
    const isSuperAdmin = requester.roles.includes('SUPER_ADMIN');
    if (!isOwner && !isSuperAdmin) {
      throw new ForbiddenException(`Solo el organizador dueño del evento puede ${action}`);
    }
  }
}
