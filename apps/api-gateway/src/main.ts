import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { AppModule } from './app.module';
import { buildRoutes } from './routes';
import { gatewayAuthMiddleware, stripClientInternalHeaders } from './gateway.middleware';

async function bootstrap() {
  // bodyParser: false — el gateway es un proxy puro, no debe consumir el
  // stream del request; se lo pasa intacto a los servicios internos.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

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

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`api-gateway escuchando en http://localhost:${port}`);
}
bootstrap();
