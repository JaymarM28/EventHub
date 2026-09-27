import { apiClient } from './client';

export interface Venue {
  id: string;
  name: string;
  address: string;
  capacity: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface VenueInput {
  name: string;
  address: string;
  capacity?: number;
}

export async function listVenues(): Promise<Venue[]> {
  const response = await apiClient.get<Venue[]>('/venues');
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
