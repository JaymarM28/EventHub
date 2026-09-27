import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_SIGNATURE_HEADER,
  signInternalContext,
} from '@event-hub/internal-auth';

export interface ZoneWithOrganizer {
  eventId: string;
  eventTitle: string;
  organizerId: string;
  venue: string;
  city: string | null;
  startsAt: string;
  currency: string;
  zoneName: string;
  zonePrice: string;
}

/** Mismo patrón de identidad "sistema" que UsersClientService — ver el
 * comentario ahí para el porqué (consumidor de RabbitMQ, sin request de
 * usuario final de la cual reenviar un header). */
@Injectable()
export class EventsClientService {
  private readonly baseUrl: string;
  private readonly internalAuthSecret: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.baseUrl = config.getOrThrow<string>('EVENTS_SERVICE_URL');
    this.internalAuthSecret = config.getOrThrow<string>('INTERNAL_AUTH_SECRET');
  }

  async findZoneWithOrganizer(zoneId: string): Promise<ZoneWithOrganizer> {
    const { payload, signature } = signInternalContext(
      { userId: 'system:notifications-service', email: 'system@event-hub.internal', roles: ['SUPER_ADMIN'], validatedAt: Date.now() },
      this.internalAuthSecret,
    );

    try {
      const response = await firstValueFrom(
        this.http.get<ZoneWithOrganizer>(`${this.baseUrl}/internal/zones/${zoneId}`, {
          headers: {
            [INTERNAL_CONTEXT_HEADER]: payload,
            [INTERNAL_SIGNATURE_HEADER]: signature,
          },
        }),
      );
      return response.data;
    } catch (err) {
      throw this.toHttpException(err);
    }
  }

  private toHttpException(err: unknown): HttpException {
    const axiosErr = err as AxiosError<{ message?: string }>;
    if (axiosErr.response) {
      const status = axiosErr.response.status;
      const message = axiosErr.response.data?.message ?? 'Error en events-service';
      return new HttpException(message, status);
    }
    return new HttpException('events-service no disponible', HttpStatus.SERVICE_UNAVAILABLE);
  }
}
