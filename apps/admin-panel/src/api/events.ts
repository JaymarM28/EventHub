import { apiClient } from './client';

export interface Zone {
  id: string;
  name: string;
  price: string;
  capacity: number;
}

export interface EventItem {
  id: string;
  title: string;
  description: string | null;
  venue: string;
  startsAt: string;
  organizerId: string;
  zones: Zone[];
}

export interface ZoneDraft {
  name: string;
  price: number;
  capacity: number;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  venue: string;
  startsAt: string;
  zones: ZoneDraft[];
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  venue?: string;
  startsAt?: string;
}

export interface ZoneDashboard {
  zoneId: string;
  name: string;
  price: string;
  capacity: number;
  sold: number;
  revenue: number;
}

export interface EventDashboard {
  eventId: string;
  zones: ZoneDashboard[];
  totalCapacity: number;
  totalSold: number;
  totalRevenue: number;
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
}

export async function updateZone(eventId: string, zoneId: string, input: UpdateZoneInput): Promise<EventItem> {
  const response = await apiClient.patch<EventItem>(`/events/${eventId}/zones/${zoneId}`, input);
  return response.data;
}
