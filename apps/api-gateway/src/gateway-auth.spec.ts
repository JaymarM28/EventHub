import jwt from 'jsonwebtoken';
import { verifyInternalContext } from '@event-hub/internal-auth';
import { GatewayAuthError, verifyAndSignInternalContext } from './gateway-auth';

const JWT_SECRET = 'test-jwt-secret';
const INTERNAL_SECRET = 'test-internal-secret';

function makeAccessToken(overrides: Partial<Record<string, unknown>> = {}) {
  return jwt.sign(
    {
      sub: 'user-1',
      email: 'a@b.com',
      roles: ['ATTENDEE'],
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: '15m' },
  );
}

describe('verifyAndSignInternalContext', () => {
  it('rechaza si falta el header Authorization', () => {
    expect(() =>
      verifyAndSignInternalContext(undefined, JWT_SECRET, INTERNAL_SECRET),
    ).toThrow(GatewayAuthError);
  });

  it('rechaza un header sin el prefijo Bearer', () => {
    expect(() =>
      verifyAndSignInternalContext(
        'Token abc123',
        JWT_SECRET,
        INTERNAL_SECRET,
      ),
    ).toThrow(GatewayAuthError);
  });

  it('rechaza un JWT firmado con un secret distinto', () => {
    const token = jwt.sign({ sub: 'u1' }, 'otro-secret', {
      expiresIn: '15m',
    });
    expect(() =>
      verifyAndSignInternalContext(
        `Bearer ${token}`,
        JWT_SECRET,
        INTERNAL_SECRET,
      ),
    ).toThrow(GatewayAuthError);
  });

  it('rechaza un JWT expirado', () => {
    const token = jwt.sign(
      { sub: 'user-1', email: 'a@b.com', roles: ['ATTENDEE'] },
      JWT_SECRET,
      { expiresIn: -10 }, // ya expirado
    );
    expect(() =>
      verifyAndSignInternalContext(
        `Bearer ${token}`,
        JWT_SECRET,
        INTERNAL_SECRET,
      ),
    ).toThrow(GatewayAuthError);
  });

  it('con un JWT válido, produce un contexto interno firmado y verificable', () => {
    const token = makeAccessToken();

    const { payload, signature } = verifyAndSignInternalContext(
      `Bearer ${token}`,
      JWT_SECRET,
      INTERNAL_SECRET,
    );

    const context = verifyInternalContext(payload, signature, INTERNAL_SECRET);
    expect(context.userId).toBe('user-1');
    expect(context.email).toBe('a@b.com');
    expect(context.roles).toEqual(['ATTENDEE']);
  });

  it('el contexto firmado no es verificable con el internal secret equivocado', () => {
    const token = makeAccessToken();
    const { payload, signature } = verifyAndSignInternalContext(
      `Bearer ${token}`,
      JWT_SECRET,
      INTERNAL_SECRET,
    );

    expect(() =>
      verifyInternalContext(payload, signature, 'secret-equivocado'),
    ).toThrow();
  });
});
