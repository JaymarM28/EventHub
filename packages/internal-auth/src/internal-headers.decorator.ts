import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { INTERNAL_CONTEXT_HEADER, INTERNAL_SIGNATURE_HEADER } from './internal-auth.types';

export interface RawInternalHeaders {
  [key: string]: string;
  [INTERNAL_CONTEXT_HEADER]: string;
  [INTERNAL_SIGNATURE_HEADER]: string;
}

/**
 * Extrae el header interno crudo (payload + firma) del request entrante,
 * para REENVIARLO intacto en una llamada síncrona a otro servicio interno
 * (ej. orders-service → tickets-service, Finding 1 del eng review). No lo
 * revalida ni lo re-firma — el servicio destino confía en la misma firma
 * que ya puso api-gateway.
 */
export const InternalHeaders = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): RawInternalHeaders => {
    const request = ctx.switchToHttp().getRequest();
    return {
      [INTERNAL_CONTEXT_HEADER]: request.headers[INTERNAL_CONTEXT_HEADER],
      [INTERNAL_SIGNATURE_HEADER]: request.headers[INTERNAL_SIGNATURE_HEADER],
    };
  },
);
