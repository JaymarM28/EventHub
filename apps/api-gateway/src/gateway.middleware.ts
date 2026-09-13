import { Request, Response, NextFunction, RequestHandler } from 'express';
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_SIGNATURE_HEADER,
} from '@event-hub/internal-auth';
import { GatewayAuthError, verifyAndSignInternalContext } from './gateway-auth';
import { ServiceRoute } from './routes';

/**
 * Nunca confiar en un header interno que venga del cliente — se descarta en
 * TODA request, pública o no, antes de que el gateway decida si agrega el
 * suyo propio. Sin esto, un cliente podría intentar forjar el contexto en
 * una ruta pública (aunque no pueda firmarlo sin el secret, mejor no dejar
 * que el header ajeno llegue nunca a un servicio interno).
 */
export function stripClientInternalHeaders(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  delete req.headers[INTERNAL_CONTEXT_HEADER];
  delete req.headers[INTERNAL_SIGNATURE_HEADER];
  next();
}

/**
 * Para rutas protegidas: valida el JWT y agrega el header interno firmado.
 * Para rutas públicas (auth/*): no hace nada, deja pasar directo al proxy.
 */
export function gatewayAuthMiddleware(
  route: ServiceRoute,
  jwtSecret: string,
  internalAuthSecret: string,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (route.public) {
      next();
      return;
    }

    try {
      const { payload, signature } = verifyAndSignInternalContext(
        req.headers.authorization,
        jwtSecret,
        internalAuthSecret,
      );
      req.headers[INTERNAL_CONTEXT_HEADER] = payload;
      req.headers[INTERNAL_SIGNATURE_HEADER] = signature;
      delete req.headers.authorization; // los servicios internos no deben confiar en el JWT crudo
      next();
    } catch (err) {
      if (err instanceof GatewayAuthError) {
        res.status(401).json({ statusCode: 401, message: err.message });
        return;
      }
      next(err);
    }
  };
}
