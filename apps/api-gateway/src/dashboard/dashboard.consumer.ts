import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { EVENT_TYPES, EventEnvelope } from '@event-hub/shared-types';
import { TicketsClientService } from './tickets-client.service';
import { DashboardGateway } from './dashboard.gateway';

interface TicketIssuedPayload {
  ticketId: string;
  orderId: string;
  userId: string;
  zoneId: string;
}

/**
 * Primera vez que api-gateway consume eventos de dominio (hasta ahora era
 * proxy HTTP puro) — justificado porque "avisar en vivo" es, por
 * definición, un trabajo del único servicio con una conexión abierta
 * hacia el cliente (el WebSocket vive acá, ver DashboardGateway).
 */
@Controller()
export class DashboardConsumer {
  private readonly logger = new Logger(DashboardConsumer.name);

  constructor(
    private readonly ticketsClient: TicketsClientService,
    private readonly dashboardGateway: DashboardGateway,
  ) {}

  @EventPattern(EVENT_TYPES.TICKET_ISSUED)
  async handleTicketIssued(@Payload() envelope: EventEnvelope, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const message = context.getMessage();
    try {
      const payload = envelope.payload as TicketIssuedPayload;
      const eventId = await this.ticketsClient.getEventIdForTicket(payload.ticketId);
      // No hay nadie mirando esa sala todavía, o tickets-service no
      // respondió (ya logueado en TicketsClientService) — no es motivo
      // para reintentar el mensaje, solo no hay a quién avisarle.
      if (eventId) {
        this.dashboardGateway.notifyEvent(eventId, { type: 'ticket.issued', ticketId: payload.ticketId });
      }
      channel.ack(message);
    } catch (err) {
      this.logger.error(`Fallo procesando ticket.issued (eventId=${envelope.eventId}): ${(err as Error).message}`);
      channel.nack(message, false, false); // sin requeue -> DLQ
    }
  }
}
