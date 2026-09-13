import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_SIGNATURE_HEADER,
  verifyInternalContext,
} from '@event-hub/internal-auth';
import {
  gatewayAuthMiddleware,
  stripClientInternalHeaders,
} from './gateway.middleware';
import { ServiceRoute } from './routes';

const JWT_SECRET = 'jwt-secret';
const INTERNAL_SECRET = 'internal-secret';

function mockReqRes(headers: Record<string, string> = {}) {
  const req = { headers: { ...headers } } as unknown as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  const next = jest.fn();
  return { req, res, next };
}

describe('stripClientInternalHeaders', () => {
  it('elimina cualquier header interno que venga del cliente', () => {
    const { req, res, next } = mockReqRes({
      [INTERNAL_CONTEXT_HEADER]: 'fake-payload',
      [INTERNAL_SIGNATURE_HEADER]: 'fake-signature',
    });

    stripClientInternalHeaders(req, res, next);

    expect(req.headers[INTERNAL_CONTEXT_HEADER]).toBeUndefined();
    expect(req.headers[INTERNAL_SIGNATURE_HEADER]).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('gatewayAuthMiddleware', () => {
  const publicRoute: ServiceRoute = {
    pathPrefix: '/auth',
    target: 'http://x',
    public: true,
  };
  const protectedRoute: ServiceRoute = {
    pathPrefix: '/tickets',
    target: 'http://y',
    public: false,
  };

  it('en una ruta pública, deja pasar sin tocar headers', () => {
    const { req, res, next } = mockReqRes();
    const middleware = gatewayAuthMiddleware(publicRoute, JWT_SECRET, INTERNAL_SECRET);

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.headers[INTERNAL_CONTEXT_HEADER]).toBeUndefined();
  });

  it('en una ruta protegida sin Authorization, responde 401 y no llama next()', () => {
    const { req, res, next } = mockReqRes();
    const middleware = gatewayAuthMiddleware(protectedRoute, JWT_SECRET, INTERNAL_SECRET);

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('en una ruta protegida con JWT válido, firma el contexto y llama next()', () => {
    const token = jwt.sign(
      { sub: 'user-1', email: 'a@b.com', roles: ['ATTENDEE'] },
      JWT_SECRET,
      { expiresIn: '15m' },
    );
    const { req, res, next } = mockReqRes({ authorization: `Bearer ${token}` });
    const middleware = gatewayAuthMiddleware(protectedRoute, JWT_SECRET, INTERNAL_SECRET);

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.headers.authorization).toBeUndefined(); // no debe llegar el JWT crudo al servicio interno

    const payload = req.headers[INTERNAL_CONTEXT_HEADER] as string;
    const signature = req.headers[INTERNAL_SIGNATURE_HEADER] as string;
    const context = verifyInternalContext(payload, signature, INTERNAL_SECRET);
    expect(context.userId).toBe('user-1');
  });
});
