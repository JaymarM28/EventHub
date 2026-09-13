import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_SIGNATURE_HEADER,
  InternalUserContext,
} from './internal-auth.types';
import { verifyInternalContext } from './sign-internal-context';

/**
 * Guard compartido — cada microservicio interno lo registra globalmente
 * (o por controller) en vez de reimplementar validación de JWT.
 *
 * Uso:
 *   providers: [{ provide: APP_GUARD, useFactory: () => new InternalAuthGuard(process.env.INTERNAL_AUTH_SECRET!) }]
 *
 * Requiere que INTERNAL_AUTH_SECRET sea el MISMO valor en api-gateway y en
 * todos los servicios internos (ver .env.example).
 */
@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(private readonly secret: string) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const payload = request.headers[INTERNAL_CONTEXT_HEADER];
    const signature = request.headers[INTERNAL_SIGNATURE_HEADER];

    if (!payload || !signature) {
      throw new UnauthorizedException(
        'Falta el contexto interno — este endpoint solo es accesible vía api-gateway',
      );
    }

    try {
      const userContext: InternalUserContext = verifyInternalContext(
        payload,
        signature,
        this.secret,
      );
      // Disponible en el controller vía @InternalUser() (ver internal-user.decorator.ts)
      request.internalUser = userContext;
      return true;
    } catch (err) {
      throw new UnauthorizedException(
        `Contexto interno inválido: ${(err as Error).message}`,
      );
    }
  }
}
