import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { InternalUserContext, UserRole } from '@event-hub/internal-auth';
import { EventsClientService } from './events-client.service';

interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: UserRole[];
}

/**
 * "Ventas/aforo en vivo" del admin panel (fase stretch de DESIGN.md,
 * decisión: WebSocket real en vez de polling). Vive en api-gateway porque
 * es el único servicio pensado para exponerse — un servicio interno
 * nuevo solo para esto hubiera duplicado esa responsabilidad.
 *
 * Protocolo: el cliente se conecta con el JWT en el handshake
 * (`auth: { token }`), y emite `join` con `{ eventId }` por cada
 * dashboard que tenga abierto. Cada socket puede estar en varias salas
 * (`event:<id>`) a la vez. `DashboardConsumer` (consumidor RMQ de
 * ticket.issued) emite `update` a la sala correspondiente cuando cambia
 * algo — el cliente decide qué hacer con eso (típicamente: volver a pedir
 * GET /events/:id/dashboard).
 */
@WebSocketGateway({ namespace: 'dashboard', cors: { origin: true } })
export class DashboardGateway {
  private readonly logger = new Logger(DashboardGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly eventsClient: EventsClientService) {}

  handleConnection(client: Socket) {
    const user = this.authenticate(client);
    if (!user) {
      client.disconnect(true);
      return;
    }
    client.data.user = user;
  }

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { eventId?: string },
  ): Promise<{ ok: boolean; message?: string }> {
    const user: InternalUserContext | undefined = client.data.user;
    const eventId = body?.eventId;
    if (!user || !eventId) {
      return { ok: false, message: 'Falta eventId' };
    }

    const organizerId = await this.eventsClient.getOrganizerId(eventId);
    if (!organizerId) {
      return { ok: false, message: 'Evento no encontrado' };
    }

    const isOwner = organizerId === user.userId;
    const isSuperAdmin = user.roles.includes('SUPER_ADMIN');
    if (!isOwner && !isSuperAdmin) {
      return { ok: false, message: 'No tienes permiso para ver este evento' };
    }

    await client.join(this.roomFor(eventId));
    return { ok: true };
  }

  /** Llamado por DashboardConsumer, no por un cliente — no es un
   * @SubscribeMessage porque no responde a un mensaje entrante de socket. */
  notifyEvent(eventId: string, payload: unknown): void {
    this.server.to(this.roomFor(eventId)).emit('update', payload);
  }

  private roomFor(eventId: string): string {
    return `event:${eventId}`;
  }

  private authenticate(client: Socket): InternalUserContext | null {
    const token = client.handshake.auth?.token as string | undefined;
    const jwtSecret = process.env.JWT_SECRET;
    if (!token || !jwtSecret) return null;
    try {
      const decoded = jwt.verify(token, jwtSecret) as AccessTokenPayload;
      return { userId: decoded.sub, email: decoded.email, roles: decoded.roles, validatedAt: Date.now() };
    } catch (err) {
      this.logger.warn(`Socket rechazado: JWT inválido (${(err as Error).message})`);
      return null;
    }
  }
}
