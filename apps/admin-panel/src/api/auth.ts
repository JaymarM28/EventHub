import { apiClient } from './client';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/auth/login', { email, password });
  return response.data;
}

export interface CurrentUser {
  userId: string;
  email: string;
  roles: string[];
}

/** No hay endpoint /auth/me — los datos ya viajan en el JWT (mismo
 * enfoque que la app Flutter, ver core/auth_state.dart ahí). */
export function decodeToken(token: string): CurrentUser | null {
  try {
    const [, payloadB64] = token.split('.');
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    return { userId: payload.sub, email: payload.email, roles: payload.roles ?? [] };
  } catch {
    return null;
  }
}
