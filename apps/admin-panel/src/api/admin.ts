import { apiClient } from './client';

export interface PlatformUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  roles: string[];
  createdAt: string;
}

export interface CreateOrganizerInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  birthDate: string;
}

export async function createOrganizer(input: CreateOrganizerInput): Promise<{ id: string; email: string }> {
  const response = await apiClient.post<{ id: string; email: string }>('/auth/admin/organizers', input);
  return response.data;
}

export async function listUsers(): Promise<PlatformUser[]> {
  const response = await apiClient.get<PlatformUser[]>('/auth/admin/users');
  return response.data;
}

export async function updateUserRoles(userId: string, roles: string[]): Promise<PlatformUser> {
  const response = await apiClient.patch<PlatformUser>(`/auth/admin/users/${userId}/roles`, { roles });
  return response.data;
}
