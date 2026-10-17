"use client";

import { API_URL, ApiError } from "./api";

const ACCESS_TOKEN_KEY = "eventhub_access_token";
const REFRESH_TOKEN_KEY = "eventhub_refresh_token";

export interface CurrentUser {
  userId: string;
  email: string;
  roles: string[];
}

/** No hay endpoint /auth/me — los datos ya viajan en el JWT (mismo
 * criterio que admin-panel/src/api/auth.ts y la app Flutter). */
export function decodeToken(token: string): CurrentUser | null {
  try {
    const [, payloadB64] = token.split(".");
    const payload = JSON.parse(
      atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return { userId: payload.sub, email: payload.email, roles: payload.roles ?? [] };
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function saveTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

let refreshPromise: Promise<boolean> | null = null;

/** El access token dura 15 minutos (JWT_EXPIRES_IN en auth-service) —
 * mucho menos que una sesión de compra típica, así que hace falta
 * refrescar solo, no alcanza con guardar el token nada más (a diferencia
 * del admin-panel, pensado para uso interno donde volver a loguearse cada
 * rato es tolerable). Mismo criterio que ApiClient en la app Flutter:
 * UN solo intento de refresh, y si también falla, sesión terminada de
 * verdad. `refreshPromise` evita que requests en paralelo disparen cada
 * uno su propio refresh (y roten el refresh token entre sí).
 */
async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) {
        clearTokens();
        return false;
      }
      const data = await response.json();
      saveTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    }
  })();

  const result = await refreshPromise;
  refreshPromise = null;
  return result;
}

/** fetch autenticado hacia el gateway — adjunta el JWT y reintenta UNA vez
 * tras refrescar ante un 401, igual que ApiClient.dart. Para llamadas
 * públicas (sin sesión) usar `apiFetch` de `./api` directo. */
export async function authFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const doFetch = async (): Promise<Response> => {
    const token = getAccessToken();
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...init?.headers,
      },
    });
  };

  let response = await doFetch();
  if (response.status === 401 && !path.startsWith("/auth/")) {
    const refreshed = await tryRefresh();
    if (refreshed) response = await doFetch();
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      (body && typeof body.message === "string" ? body.message : null) ??
        "No se pudo conectar con el servidor",
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
