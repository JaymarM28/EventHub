import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { RawInternalHeaders } from '@event-hub/internal-auth';

export interface RedeemedDiscount {
  type: 'PERCENTAGE' | 'FIXED';
  value: string;
  zonePrice: string;
}

export interface ZoneOwner {
  eventId: string;
  organizerId: string;
}

/**
 * Llamada SÍNCRONA a events-service durante el checkout (#23) — mismo
 * patrón que TicketsClientService: reenvía el MISMO header interno que
 * orders-service recibió del comprador, no lo re-firma.
 */
@Injectable()
export class EventsClientService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.baseUrl = config.getOrThrow<string>('EVENTS_SERVICE_URL');
  }

  async redeemDiscountCode(zoneId: string, code: string, headers: RawInternalHeaders): Promise<RedeemedDiscount> {
    try {
      const response = await firstValueFrom(
        this.http.post<RedeemedDiscount>(`${this.baseUrl}/internal/zones/${zoneId}/redeem-discount`, { code }, { headers }),
      );
      return response.data;
    } catch (err) {
      throw this.toHttpException(err);
    }
  }

  /** #22 — quién puede reembolsar esta orden: el dueño del evento al que
   * pertenece su zona (o SUPER_ADMIN, chequeado por el caller). */
  async getZoneOwner(zoneId: string, headers: RawInternalHeaders): Promise<ZoneOwner> {
    try {
      const response = await firstValueFrom(
        this.http.get<ZoneOwner>(`${this.baseUrl}/internal/zones/${zoneId}`, { headers }),
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
