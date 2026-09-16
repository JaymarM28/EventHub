import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Llamada a `GET /internal/tickets/:id` de tickets-service (peek, ver su
 * comentario ahí) — marcada `@Public()` justo para este caso: el
 * consumidor RMQ de ticket.issued no cuelga de ninguna request HTTP de la
 * que reenviar un contexto de usuario. Solo se usa para resolver a qué
 * evento avisarle que hubo una venta nueva.
 */
@Injectable()
export class TicketsClientService {
  private readonly logger = new Logger(TicketsClientService.name);
  private readonly baseUrl = process.env.TICKETS_SERVICE_URL ?? 'http://localhost:3003';

  constructor(private readonly http: HttpService) {}

  async getEventIdForTicket(ticketId: string): Promise<string | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ eventId: string }>(`${this.baseUrl}/internal/tickets/${ticketId}`),
      );
      return response.data.eventId;
    } catch (err) {
      this.logger.error(`No se pudo resolver el eventId del boleto ${ticketId}: ${(err as Error).message}`);
      return null;
    }
  }
}
