import { apiClient } from './client';

async function upload(path: string, file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const response = await apiClient.post<{ url: string }>(path, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data.url;
}

export function uploadVenueMap(file: File): Promise<string> {
  return upload('/uploads/venue-map', file);
}

export function uploadEventImage(file: File): Promise<string> {
  return upload('/uploads/event-image', file);
}
