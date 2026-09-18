import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { RawInternalHeaders } from '@event-hub/internal-auth';

export interface ReservationResult {
  reservationId: string;
  expiresAt: number;
  zoneId: string;
  quantity: number;
  price: number; // precio UNITARIO — el caller multiplica por quantity
}

/**
 * Llamada SÍNCRONA a tickets-service (Finding 1 del eng review). Propaga
 * el MISMO header interno que orders-service recibió de api-gateway — no
 * lo revalida ni lo re-firma, simplemente lo reenvía intacto, así
 * tickets-service confía en él igual que confiaría en cualquier request
 * que viniera directo del gateway.
 */
@Injectable()
export class TicketsClientService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.baseUrl = config.getOrThrow<string>('TICKETS_SERVICE_URL');
  }

  async reserve(zoneId: string, quantity: number, headers: RawInternalHeaders): Promise<ReservationResult> {
    try {
      const response = await firstValueFrom(
        this.http.post<ReservationResult>(
          `${this.baseUrl}/reservations`,
          { zoneId, quantity },
          { headers },
        ),
      );
      return response.data;
    } catch (err) {
      throw this.toHttpException(err);
    }
  }

  async release(reservationId: string, headers: RawInternalHeaders): Promise<void> {
    try {
      await firstValueFrom(
        this.http.delete(`${this.baseUrl}/reservations/${reservationId}`, { headers }),
      );
    } catch (err) {
      throw this.toHttpException(err);
    }
  }

  /**
   * Sin esto, un error 4xx de tickets-service (ej. 409 "zona agotada")
   * llega a Nest como un AxiosError crudo, que el exception filter por
   * defecto convierte en 500 — el cliente final nunca se entera de que el
   * problema real fue "zona agotada", solo ve "internal server error".
   */
  private toHttpException(err: unknown): HttpException {
    const axiosErr = err as AxiosError<{ message?: string }>;
    if (axiosErr.response) {
      const status = axiosErr.response.status;
      const message = axiosErr.response.data?.message ?? 'Error en tickets-service';
      return new HttpException(message, status);
    }
    return new HttpException(
      'tickets-service no disponible',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
