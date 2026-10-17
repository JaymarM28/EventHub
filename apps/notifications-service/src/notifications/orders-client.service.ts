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

interface OrderForZones {
  userId: string;
  zoneId: string;
  status: string;
}

/** Notificaciones push (2026-09-29) — resuelve a QUIÉN avisarle el
 * recordatorio de un evento, reusando `GET /orders/for-zones` (ya existe
 * para el soporte al comprador del organizador, #22) con una identidad
 * "sistema" — mismo patrón que EventsClientService/UsersClientService de
 * este mismo servicio, y que el resto del proyecto para llamadas
 * service-to-service sin un request de usuario final de la cual reenviar
 * un header. */
@Injectable()
export class OrdersClientService {
  private readonly baseUrl: string;
  private readonly internalAuthSecret: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.baseUrl = config.getOrThrow<string>('ORDERS_SERVICE_URL');
    this.internalAuthSecret = config.getOrThrow<string>('INTERNAL_AUTH_SECRET');
  }

  async findBuyerIdsByZones(zoneIds: string[]): Promise<string[]> {
    if (zoneIds.length === 0) return [];
    const { payload, signature } = signInternalContext(
      { userId: 'system:notifications-service', email: 'system@event-hub.internal', roles: ['SUPER_ADMIN'], validatedAt: Date.now() },
      this.internalAuthSecret,
    );

    try {
      const response = await firstValueFrom(
        this.http.get<OrderForZones[]>(`${this.baseUrl}/orders/for-zones`, {
          params: { zoneIds: zoneIds.join(',') },
          headers: {
            [INTERNAL_CONTEXT_HEADER]: payload,
            [INTERNAL_SIGNATURE_HEADER]: signature,
          },
        }),
      );
      // Un mismo comprador puede tener varias órdenes de este evento
      // (distintas zonas, o varias compras) — un solo recordatorio le
      // alcanza, no uno por orden.
      const buyerIds = response.data.filter((o) => o.status === 'PAID').map((o) => o.userId);
      return [...new Set(buyerIds)];
    } catch (err) {
      throw this.toHttpException(err);
    }
  }

  private toHttpException(err: unknown): HttpException {
    const axiosErr = err as AxiosError<{ message?: string }>;
    if (axiosErr.response) {
      const status = axiosErr.response.status;
      const message = axiosErr.response.data?.message ?? 'Error en orders-service';
      return new HttpException(message, status);
    }
    return new HttpException('orders-service no disponible', HttpStatus.SERVICE_UNAVAILABLE);
  }
}
