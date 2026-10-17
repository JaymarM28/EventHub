import type { EventSummary } from "./types";

/**
 * Base del api-gateway (único ingreso público de la plataforma, ver
 * DESIGN.md) — mismo criterio que `gatewayBaseUrl` en la app Flutter
 * (apps/mobile/lib/core/config.dart): un solo lugar que sabe la URL real.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3010";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit & { token?: string },
): Promise<T> {
  const { token, ...rest } = init ?? {};
  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...rest.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      (body && typeof body.message === "string" ? body.message : null) ??
        "No se pudo conectar con el servidor",
      response.status,
    );
  }

  // 204 No Content — ej. DELETE — no tiene body que parsear.
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/** Listado público de eventos — Server Component, sin caché: la
 * disponibilidad de cupos cambia en vivo, no tiene sentido servir una
 * versión vieja. */
export function listEvents(): Promise<EventSummary[]> {
  return apiFetch<EventSummary[]>("/events", { cache: "no-store" });
}

export function getEvent(id: string): Promise<EventSummary> {
  return apiFetch<EventSummary>(`/events/${id}`, { cache: "no-store" });
}

export { apiFetch, API_URL };
