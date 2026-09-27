import { apiClient } from './client';
import type { VenueSection } from './venues';

export interface Zone {
  id: string;
  name: string;
  price: string;
  capacity: number;
  venueSectionId: string | null;
}

/** Debe mantenerse en sync con EventCategory en events-service/prisma/schema.prisma. */
export type EventCategory = 'MUSICA' | 'DEPORTES' | 'TEATRO' | 'CONFERENCIA' | 'FESTIVAL' | 'OTRO';

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  MUSICA: 'Música',
  DEPORTES: 'Deportes',
  TEATRO: 'Teatro',
  CONFERENCIA: 'Conferencia',
  FESTIVAL: 'Festival',
  OTRO: 'Otro',
};

export interface EventItem {
  id: string;
  title: string;
  description: string | null;
  venue: string;
  venueId: string | null;
  /** Solo viene en la vista de detalle (findOne) — findAll/findByOrganizer no lo incluyen. */
  venueRef?: { id: string; name: string; mapImageUrl: string | null; sections: VenueSection[] } | null;
  city: string | null;
  category: EventCategory | null;
  startsAt: string;
  organizerId: string;
  zones: Zone[];
  coverImageUrl: string | null;
  galleryImageUrls: string[];
  /** Geocodificadas automáticamente por el backend (DESIGN.md #18) — no se editan desde el panel. */
  latitude: number | null;
  longitude: number | null;
}

export interface ZoneDraft {
  name: string;
  price: number;
  capacity: number;
  venueSectionId?: string;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  venue: string;
  venueId?: string;
  city: string;
  category: EventCategory;
  startsAt: string;
  zones: ZoneDraft[];
  coverImageUrl?: string;
  galleryImageUrls?: string[];
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  venue?: string;
  venueId?: string;
  city?: string;
  category?: EventCategory;
  startsAt?: string;
  coverImageUrl?: string;
  galleryImageUrls?: string[];
}

export interface ZoneDashboard {
  zoneId: string;
  name: string;
  price: string;
  capacity: number;
  sold: number;
  revenue: number;
}

export interface SalesTimelineEntry {
  day: string;
  sold: number;
  revenue: number;
}

export interface EventDashboard {
  eventId: string;
  zones: ZoneDashboard[];
  totalCapacity: number;
  totalSold: number;
  totalRevenue: number;
  salesTimeline: SalesTimelineEntry[];
}

export interface StaffMember {
  id: string;
  eventId: string;
  userId: string;
  email: string;
  createdAt: string;
}

export interface AddStaffInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  birthDate: string;
}

/** Debe mantenerse en sync con DiscountType en events-service/prisma/schema.prisma. */
export type DiscountType = 'PERCENTAGE' | 'FIXED';

export interface DiscountCode {
  id: string;
  eventId: string;
  code: string;
  type: DiscountType;
  value: string;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  createdAt: string;
}

export interface CreateDiscountCodeInput {
  code: string;
  type: DiscountType;
  value: number;
  maxUses?: number;
}

export async function findMyEvents(): Promise<EventItem[]> {
  const response = await apiClient.get<EventItem[]>('/events/mine');
  return response.data;
}

export async function findEvent(id: string): Promise<EventItem> {
  const response = await apiClient.get<EventItem>(`/events/${id}`);
  return response.data;
}

export async function createEvent(input: CreateEventInput): Promise<EventItem> {
  const response = await apiClient.post<EventItem>('/events', input);
  return response.data;
}

export async function updateEvent(id: string, input: UpdateEventInput): Promise<EventItem> {
  const response = await apiClient.patch<EventItem>(`/events/${id}`, input);
  return response.data;
}

export async function getDashboard(id: string): Promise<EventDashboard> {
  const response = await apiClient.get<EventDashboard>(`/events/${id}/dashboard`);
  return response.data;
}

export async function listStaff(id: string): Promise<StaffMember[]> {
  const response = await apiClient.get<StaffMember[]>(`/events/${id}/staff`);
  return response.data;
}

export async function addStaff(id: string, input: AddStaffInput): Promise<StaffMember> {
  const response = await apiClient.post<StaffMember>(`/events/${id}/staff`, input);
  return response.data;
}

export async function addZone(eventId: string, zone: ZoneDraft): Promise<EventItem> {
  const response = await apiClient.post<EventItem>(`/events/${eventId}/zones`, zone);
  return response.data;
}

export interface UpdateZoneInput {
  name?: string;
  price?: number;
  capacity?: number;
  venueSectionId?: string;
}

export async function updateZone(eventId: string, zoneId: string, input: UpdateZoneInput): Promise<EventItem> {
  const response = await apiClient.patch<EventItem>(`/events/${eventId}/zones/${zoneId}`, input);
  return response.data;
}

export async function listDiscountCodes(eventId: string): Promise<DiscountCode[]> {
  const response = await apiClient.get<DiscountCode[]>(`/events/${eventId}/discount-codes`);
  return response.data;
}

export async function createDiscountCode(eventId: string, input: CreateDiscountCodeInput): Promise<DiscountCode> {
  const response = await apiClient.post<DiscountCode>(`/events/${eventId}/discount-codes`, input);
  return response.data;
}

export async function setDiscountCodeActive(eventId: string, codeId: string, active: boolean): Promise<DiscountCode> {
  const response = await apiClient.patch<DiscountCode>(`/events/${eventId}/discount-codes/${codeId}`, { active });
  return response.data;
}
