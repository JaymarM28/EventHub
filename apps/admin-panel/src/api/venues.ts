import { apiClient } from './client';

export interface VenueSectionPoint {
  x: number;
  y: number;
}

export interface VenueSection {
  id: string;
  venueId: string;
  name: string;
  points: VenueSectionPoint[];
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  capacity: number | null;
  mapImageUrl: string | null;
  sections?: VenueSection[];
  createdAt: string;
  updatedAt: string;
}

export interface VenueInput {
  name: string;
  address: string;
  capacity?: number;
  mapImageUrl?: string;
}

export interface VenueSectionInput {
  name: string;
  points: VenueSectionPoint[];
}

export async function listVenues(): Promise<Venue[]> {
  const response = await apiClient.get<Venue[]>('/venues');
  return response.data;
}

export async function getVenue(id: string): Promise<Venue> {
  const response = await apiClient.get<Venue>(`/venues/${id}`);
  return response.data;
}

export async function createVenue(input: VenueInput): Promise<Venue> {
  const response = await apiClient.post<Venue>('/venues', input);
  return response.data;
}

export async function updateVenue(id: string, input: Partial<VenueInput>): Promise<Venue> {
  const response = await apiClient.patch<Venue>(`/venues/${id}`, input);
  return response.data;
}

export async function createVenueSection(venueId: string, input: VenueSectionInput): Promise<VenueSection> {
  const response = await apiClient.post<VenueSection>(`/venues/${venueId}/sections`, input);
  return response.data;
}

export async function updateVenueSection(
  venueId: string,
  sectionId: string,
  input: Partial<VenueSectionInput>,
): Promise<VenueSection> {
  const response = await apiClient.patch<VenueSection>(`/venues/${venueId}/sections/${sectionId}`, input);
  return response.data;
}
