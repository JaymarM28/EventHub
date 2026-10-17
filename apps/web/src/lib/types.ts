/** Debe mantenerse en sync con EventCategory en events-service/prisma/schema.prisma
 * (mismo criterio que admin-panel/src/api/events.ts — cada cliente mantiene
 * su propia copia de estos tipos, no hay paquete compartido de DTOs). */
export type EventCategory =
  | "MUSICA"
  | "DEPORTES"
  | "TEATRO"
  | "CONFERENCIA"
  | "FESTIVAL"
  | "OTRO";

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  MUSICA: "Música",
  DEPORTES: "Deportes",
  TEATRO: "Teatro",
  CONFERENCIA: "Conferencia",
  FESTIVAL: "Festival",
  OTRO: "Otro",
};

export interface Zone {
  id: string;
  name: string;
  price: string;
  capacity: number;
}

export interface EventSummary {
  id: string;
  title: string;
  description: string | null;
  venue: string;
  city: string | null;
  category: EventCategory | null;
  startsAt: string;
  organizerId: string;
  coverImageUrl: string | null;
  galleryImageUrls: string[];
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  cancelledAt: string | null;
  zones: Zone[];
  /** Solo viene en GET /events (listado) — ver EventsService.findAll en
   * events-service. Boletos vendidos entre todas las zonas, usado para
   * ordenar por popularidad real (ver mobile event_list_screen.dart). */
  popularity?: number;
}

/** Enriquecido por tickets-service desde su copia local de EventZone (ver
 * TicketsService.findByUser) — mismo shape que TicketModel en mobile
 * (ticket_models.dart). */
export interface Ticket {
  id: string;
  zoneId: string;
  orderId: string;
  qrToken: string;
  scannedAt: string | null;
  refundedAt: string | null;
  eventId: string | null;
  zoneName: string | null;
  zonePrice: string | null;
}
