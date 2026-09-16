import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Llamada a `GET /events/:id` de events-service — es `@Public()`, así que
 * no hace falta ningún contexto interno firmado. Se usa solo para
 * verificar quién es el organizerId de un evento antes de dejar a un
 * socket unirse a su sala de actualizaciones en vivo (ver
 * DashboardGateway.handleJoin) — nunca para servir datos de negocio.
 */
@Injectable()
export class EventsClientService {
  private readonly baseUrl = process.env.EVENTS_SERVICE_URL ?? 'http://localhost:3002';

  constructor(private readonly http: HttpService) {}

  async getOrganizerId(eventId: string): Promise<string | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ organizerId: string }>(`${this.baseUrl}/events/${eventId}`),
      );
      return response.data.organizerId;
    } catch {
      return null;
    }
  }
}
