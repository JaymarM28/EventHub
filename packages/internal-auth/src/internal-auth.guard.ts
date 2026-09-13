import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_SIGNATURE_HEADER,
  InternalUserContext,
} from './internal-auth.types';
import { verifyInternalContext } from './sign-internal-context';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Guard compartido — cada microservicio interno lo registra globalmente
 * (o por controller) en vez de reimplementar validación de JWT.
 *
 * Uso:
 *   providers: [{
 *     provide: APP_GUARD,
 *     useFactory: (reflector: Reflector) => new InternalAuthGuard(process.env.INTERNAL_AUTH_SECRET!, reflector),
 *     inject: [Reflector],
 *   }]
 *
 * Requiere que INTERNAL_AUTH_SECRET sea el MISMO valor en api-gateway y en
 * todos los servicios internos (ver .env.example). Endpoints marcados con
 * @Public() se saltan esta validación (ver public.decorator.ts).
 */
@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(
    private readonly secret: string,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

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
