import { authFetch } from "./auth-client";

/** Lista de espera (#11) — ver WaitlistService en tickets-service para el
 * diseño completo; mismo cliente que waitlist_repository.dart en mobile. */
export async function joinWaitlist(zoneId: string): Promise<void> {
  await authFetch(`/tickets/zones/${zoneId}/waitlist`, { method: "POST" });
}
