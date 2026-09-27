import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface ZoneSales {
  zoneId: string;
  sold: number;
}

export interface ZoneSalesByDay {
  zoneId: string;
  day: string;
  count: number;
}

/**
 * Llamada síncrona de solo lectura a tickets-service para el dashboard del
 * organizador (admin panel) — a diferencia de las otras llamadas
 * síncronas del proyecto (orders→tickets, access→tickets), esto no
 * reenvía el contexto interno porque el endpoint no expone datos de un
 * usuario específico, solo conteos agregados por zona.
 */
@Injectable()
export class TicketsClientService {
  private readonly logger = new Logger(TicketsClientService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.baseUrl = config.getOrThrow<string>('TICKETS_SERVICE_URL');
  }

  async soldCountByZone(zoneIds: string[]): Promise<ZoneSales[]> {
    if (zoneIds.length === 0) return [];
    try {
      const response = await firstValueFrom(
        this.http.get<ZoneSales[]>(`${this.baseUrl}/internal/tickets/summary`, {
          params: { zoneIds: zoneIds.join(',') },
        }),
      );
      return response.data;
    } catch (err) {
      // El dashboard no es un flujo crítico (a diferencia del checkout) —
      // si tickets-service no responde, se muestra "sold: 0" en vez de
      // romper toda la pantalla del organizador.
      this.logger.error(`tickets-service no respondió al pedir el resumen de ventas: ${(err as Error).message}`);
      return [];
    }
  }

  async salesByDay(zoneIds: string[]): Promise<ZoneSalesByDay[]> {
    if (zoneIds.length === 0) return [];
    try {
      const response = await firstValueFrom(
        this.http.get<ZoneSalesByDay[]>(`${this.baseUrl}/internal/tickets/sales-by-day`, {
          params: { zoneIds: zoneIds.join(',') },
        }),
      );
      return response.data;
    } catch (err) {
      // Mismo criterio que soldCountByZone: el gráfico del dashboard no es
      // un flujo crítico — si tickets-service no responde, se muestra el
      // dashboard sin el gráfico en vez de romper toda la pantalla.
      this.logger.error(`tickets-service no respondió al pedir ventas por día: ${(err as Error).message}`);
      return [];
    }
  }
}
