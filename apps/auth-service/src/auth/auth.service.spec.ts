import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    refreshToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwt: { signAsync: jest.Mock };

  const configValues: Record<string, string> = {
    JWT_SECRET: 'test-secret',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: string) =>
              configValues[key] ?? fallback,
            getOrThrow: (key: string) => {
              const v = configValues[key];
              if (!v) throw new Error(`Missing config ${key}`);
              return v;
            },
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('register', () => {
    it('crea un usuario nuevo y devuelve un par de tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        roles: ['ATTENDEE'],
      });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.register({
        email: 'a@b.com',
        password: 'password123',
        firstName: 'Ana',
        lastName: 'Gómez',
        birthDate: '1990-01-01',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toHaveLength(128); // 64 bytes en hex
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('rechaza el registro si el email ya existe', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({
          email: 'a@b.com',
          password: 'password123',
          firstName: 'Ana',
          lastName: 'Gómez',
          birthDate: '1990-01-01',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('createWithRoles', () => {
    it('crea la cuenta con los roles dados y NO emite tokens (usada por el endpoint interno)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'staff-1', email: 'staff@b.com' });

      const result = await service.createWithRoles({
        email: 'staff@b.com',
        password: 'password123',
        firstName: 'Luis',
        lastName: 'Portero',
        birthDate: '1995-01-01',
        roles: ['STAFF'],
      });

      expect(result).toEqual({ id: 'staff-1', email: 'staff@b.com' });
      expect(jwt.signAsync).not.toHaveBeenCalled();
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ roles: ['STAFF'] }) }),
      );
    });

    it('rechaza si el email ya existe', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createWithRoles({
          email: 'staff@b.com',
          password: 'password123',
          firstName: 'Luis',
          lastName: 'Portero',
          birthDate: '1995-01-01',
          roles: ['STAFF'],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('devuelve tokens con credenciales correctas', async () => {
      const passwordHash = await bcrypt.hash('password123', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash,
        roles: ['ATTENDEE'],
      });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login({
        email: 'a@b.com',
        password: 'password123',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
    });

    it('rechaza con password incorrecta', async () => {
      const passwordHash = await bcrypt.hash('password123', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash,
        roles: ['ATTENDEE'],
      });

      await expect(
        service.login({ email: 'a@b.com', password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza con email inexistente (mismo mensaje que password incorrecta)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nadie@b.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rota el refresh token y emite un nuevo par', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revoked: false,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        user: { id: 'user-1', email: 'a@b.com', roles: ['ATTENDEE'] },
      });
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refresh('some-refresh-token');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { revoked: true } }),
      );
      expect(result.accessToken).toBe('signed.jwt.token');
    });

    it('rechaza un refresh token que no existe', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh('no-existe')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rechaza un refresh token expirado', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revoked: false,
        expiresAt: new Date(Date.now() - 1000),
        user: { id: 'user-1', email: 'a@b.com', roles: ['ATTENDEE'] },
      });

      await expect(service.refresh('expirado')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('detecta reuso de un token ya rotado y revoca toda la sesión del usuario', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revoked: true, // ya fue usado antes — esto es un intento de reuso
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        user: { id: 'user-1', email: 'a@b.com', roles: ['ATTENDEE'] },
      });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      await expect(service.refresh('reusado')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', revoked: false },
          data: { revoked: true },
        }),
      );
    });
  });

  describe('logout', () => {
    it('marca el refresh token como revocado', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logout('algun-token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { revoked: true } }),
      );
    });
  });
});
