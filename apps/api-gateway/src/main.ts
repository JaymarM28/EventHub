import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Transport, RmqOptions } from '@nestjs/microservices';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { EXCHANGES, deadLetterExchangeFor, queueFor } from '@event-hub/shared-types';
import { AppModule } from './app.module';
import { buildRoutes } from './routes';
import { gatewayAuthMiddleware, stripClientInternalHeaders } from './gateway.middleware';
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
