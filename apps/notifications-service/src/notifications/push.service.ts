import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Notificaciones push (2026-09-29) — envío real vía Firebase Cloud
 * Messaging (FCM), mismo criterio que EmailService/Resend: un solo
 * proveedor real, sin capa de abstracción para "elegir proveedor" que
 * nadie pidió. FCM cubre iOS (vía su puente a APNs) y Android con la
 * misma API — evita integrar APNs por separado.
 *
 * Requiere una cuenta de servicio de Firebase (Project Settings → Service
 * Accounts → Generate new private key en la consola de Firebase) — ver
 * `.env.example` para las 3 variables que hacen falta. Sin ellas, el
 * servicio arranca igual (el envío de push es best-effort, nunca bloquea
 * el email — ver NotificationsService.notify) pero cada intento falla y
 * queda logueado.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly app: App | null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const projectId = config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = config.get<string>('FIREBASE_CLIENT_EMAIL');
    // Los saltos de línea de la clave privada vienen escapados como "\n"
    // literal en el .env (no se puede pegar una clave multilínea real ahí)
    // — hay que des-escaparlos antes de pasársela a firebase-admin.
    const privateKey = config.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');

    if (projectId && clientEmail && privateKey) {
      this.app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    } else {
      this.app = null;
      this.logger.warn(
        'FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY no configurados — las notificaciones push quedan deshabilitadas (el email sigue funcionando normal).',
      );
    }
  }

  registerToken(userId: string, token: string, platform: string) {
    return this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      // Re-registrar el mismo token actualiza el dueño — cubre el caso de
      // reinstalar la app con OTRA cuenta en el mismo dispositivo, donde
      // el token físico de FCM puede repetirse.
      update: { userId, platform },
    });
  }

  async unregisterToken(token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { token } });
  }

  /** Best-effort — un token vencido/desinstalado es normal (ver
   * NotificationsService.notify, nunca debe bloquear el email). */
  async sendToUser(userId: string, title: string, body: string): Promise<void> {
    if (!this.app) return;

    const devices = await this.prisma.deviceToken.findMany({ where: { userId } });
    if (devices.length === 0) return;

    const messaging = getMessaging(this.app);
    await Promise.all(
      devices.map(async (device) => {
        try {
          await messaging.send({ token: device.token, notification: { title, body } });
        } catch (err) {
          const code = (err as { code?: string }).code;
          if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument') {
            // Token muerto (app desinstalada, o simplemente vencido) — se
            // limpia solo en vez de acumular basura y reintentar para
            // siempre contra un token que nunca va a volver a funcionar.
            await this.unregisterToken(device.token);
          } else {
            this.logger.warn(`Push a ${userId} (token ...${device.token.slice(-6)}) falló: ${(err as Error).message}`);
          }
        }
      }),
    );
  }
}
