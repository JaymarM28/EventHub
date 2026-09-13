import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { RawInternalHeaders } from '@event-hub/internal-auth';

export type ValidateResult =
  | { valid: true; ticket: { id: string; zoneId: string; userId: string } }
  | { valid: false; reason: string; scannedAt: string };

/** Señal explícita de que tickets-service no respondió a tiempo — distinta
 * de "boleto inválido". Nunca se trata como un rechazo silencioso. */
export class TicketsServiceUnavailableError extends Error {}

@Injectable()
export class TicketsClientService {
  private readonly logger = new Logger(TicketsClientService.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.baseUrl = config.getOrThrow<string>('TICKETS_SERVICE_URL');
    this.timeoutMs = Number(config.get('TICKETS_SERVICE_TIMEOUT_MS', '3000'));
  }

  async validate(ticketId: string, headers: RawInternalHeaders): Promise<ValidateResult> {
    try {
      const response = await firstValueFrom(
        this.http.post<ValidateResult>(
          `${this.baseUrl}/internal/tickets/${ticketId}/validate`,
          {},
          { headers, timeout: this.timeoutMs },
        ),
      );
      return response.data;
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response?.status === 404) {
        throw new NotFoundException(`Boleto ${ticketId} no existe`);
      }
      // Timeout (ECONNABORTED), conexión rechazada, DNS, etc. — TODO 3 de
      // TODOS.md: nunca degradar en silencio a "inválido".
      this.logger.error(
        `tickets-service no respondió al validar ${ticketId}: ${(err as Error).message}`,
      );
      throw new TicketsServiceUnavailableError('tickets-service no disponible');
    }
  }
}
