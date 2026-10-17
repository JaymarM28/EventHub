import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Transport, RmqOptions } from '@nestjs/microservices';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { Request, Response } from 'express';
import { EXCHANGES, deadLetterExchangeFor, queueFor } from '@event-hub/shared-types';
import { AppModule } from './app.module';
import { buildRoutes } from './routes';
import { gatewayAuthMiddleware, stripClientInternalHeaders } from './gateway.middleware';
import { privacyPolicyHtml, termsOfServiceHtml } from './legal/legal-pages';
import { assertDeadLetterTopology } from './messaging/rabbit-topology';
import { CONSUMER_NAME } from './messaging/messaging.constants';

async function bootstrap() {
  const rabbitUrl = process.env.RABBITMQ_URL;
  if (!rabbitUrl) {
    throw new Error('RABBITMQ_URL es obligatorio para arrancar api-gateway');
  }

  // Debe correr ANTES de conectar el microservicio consumidor — ver el
  // comentario equivalente en tickets-service/src/main.ts.
  await assertDeadLetterTopology(rabbitUrl, CONSUMER_NAME);

  // bodyParser: false — el gateway es un proxy puro, no debe consumir el
  // stream del request; se lo pasa intacto a los servicios internos. El
  // WebSocket del admin panel (DashboardGateway) no pasa por acá — usa su
  // propio protocolo sobre el mismo servidor HTTP.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // Habilitado para que el admin panel (Vite, otro origen) pueda llamar
  // al gateway desde el navegador — la app Flutter no lo necesita (no
  // aplica same-origin policy a apps nativas).
  app.enableCors({ origin: true });

  const jwtSecret = process.env.JWT_SECRET;
  const internalAuthSecret = process.env.INTERNAL_AUTH_SECRET;
  if (!jwtSecret || !internalAuthSecret) {
    throw new Error(
      'JWT_SECRET e INTERNAL_AUTH_SECRET son obligatorios para arrancar api-gateway',
    );
  }

  app.use(stripClientInternalHeaders);

  // Páginas legales públicas (2026-10-01) — HTML servido directo acá, sin
  // proxyarlo a ningún servicio interno (ver legal/legal-pages.ts). Deben
  // registrarse ANTES del loop de rutas de abajo por la misma razón que
  // /auth/admin va antes de /auth: ninguna coincide con un prefijo
  // existente, pero mantenerlas juntas y primero deja claro que son
  // estáticas, no proxy.
  app.use('/legal/privacy', (_req: Request, res: Response) => res.type('html').send(privacyPolicyHtml));
  app.use('/legal/terms', (_req: Request, res: Response) => res.type('html').send(termsOfServiceHtml));

  for (const route of buildRoutes()) {
    app.use(route.pathPrefix, gatewayAuthMiddleware(route, jwtSecret, internalAuthSecret));
    app.use(
      route.pathPrefix,
      createProxyMiddleware({
        target: route.target,
        changeOrigin: true,
        // Express ya recortó el prefijo del mount point (route.pathPrefix)
        // de req.url — hay que restaurarlo para que el servicio interno
        // reciba la ruta completa que espera (ej. /auth/register).
        pathRewrite: (path) => route.pathPrefix + path,
      }),
    );
  }

  app.connectMicroservice<RmqOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitUrl],
      queue: queueFor(CONSUMER_NAME),
      queueOptions: {
        durable: true,
        deadLetterExchange: deadLetterExchangeFor(CONSUMER_NAME),
      },
      exchange: EXCHANGES.DOMAIN_EVENTS,
      exchangeType: 'topic',
      wildcards: true,
      noAck: false, // manual ack — ver el comentario equivalente en tickets-service/src/main.ts
    },
  });

  await app.startAllMicroservices();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`api-gateway escuchando en http://localhost:${port} (+ WebSocket /dashboard, + consumidor RMQ)`);
}
bootstrap();
