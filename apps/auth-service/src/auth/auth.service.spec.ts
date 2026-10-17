import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailClientService } from './email-client.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    refreshToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    emailVerificationToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
    passwordResetToken: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let jwt: { signAsync: jest.Mock };
  let emailClient: { send: jest.Mock };

  const configValues: Record<string, string> = {
    JWT_SECRET: 'test-secret',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    API_PUBLIC_URL: 'http://localhost:3010',
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      emailVerificationToken: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
      passwordResetToken: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(async (ops) => Promise.all(ops)),
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
    emailClient = { send: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: EmailClientService, useValue: emailClient },
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
        acceptedTerms: true,
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toHaveLength(128); // 64 bytes en hex
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      expect(prisma.emailVerificationToken.create).toHaveBeenCalledTimes(1);
      expect(emailClient.send).toHaveBeenCalledWith('a@b.com', 'Confirma tu email', expect.any(String));
      // Legal (2026-10-01) — queda registrado CUÁNDO aceptó.
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ termsAcceptedAt: expect.any(Date) }) }),
      );
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
          acceptedTerms: true,
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

  describe('findByEmail', () => {
    it('devuelve id/email si existe (usado por tickets-service para transferencias)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2', email: 'friend@b.com', passwordHash: 'hash' });

      const result = await service.findByEmail('friend@b.com');

      expect(result).toEqual({ id: 'user-2', email: 'friend@b.com' });
    });

    it('lanza NotFoundException si el email no existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findByEmail('nadie@b.com')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findById', () => {
    it('devuelve id/email si existe (usado por notifications-service)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', passwordHash: 'hash' });

      const result = await service.findById('user-1');

      expect(result).toEqual({ id: 'user-1', email: 'a@b.com' });
    });

    it('lanza NotFoundException si el id no existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findById('no-existe')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listUsers', () => {
    it('devuelve todos los usuarios sin passwordHash (panel SUPER_ADMIN)', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-1', email: 'a@b.com', passwordHash: 'secreto', roles: ['ATTENDEE'] },
      ]);

      const result = await service.listUsers();

      expect(result).toEqual([{ id: 'user-1', email: 'a@b.com', roles: ['ATTENDEE'] }]);
      expect(result[0]).not.toHaveProperty('passwordHash');
    });
  });

  describe('updateRoles', () => {
    it('reemplaza el arreglo de roles del usuario', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
      prisma.user.update.mockResolvedValue({ id: 'user-1', email: 'a@b.com', roles: ['ORGANIZER', 'VENDOR'] });

      const result = await service.updateRoles('user-1', ['ORGANIZER', 'VENDOR']);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { roles: ['ORGANIZER', 'VENDOR'] },
      });
      expect(result).toEqual({ id: 'user-1', email: 'a@b.com', roles: ['ORGANIZER', 'VENDOR'] });
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.updateRoles('no-existe', ['ORGANIZER'])).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('marca emailVerifiedAt y borra el token usado', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 1000),
      });

      await service.verifyEmail('raw-token');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { emailVerifiedAt: expect.any(Date) },
      });
      expect(prisma.emailVerificationToken.delete).toHaveBeenCalledWith({ where: { id: 'token-1' } });
    });

    it('rechaza un token que no existe', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(null);

      await expect(service.verifyEmail('no-existe')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rechaza un token expirado', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.verifyEmail('viejo')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('genera un código de 6 dígitos y lo envía si el email existe', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });

      await service.forgotPassword('a@b.com');

      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      expect(emailClient.send).toHaveBeenCalledWith(
        'a@b.com',
        'Código para recuperar tu contraseña',
        expect.stringMatching(/\d{6}/),
      );
    });

    it('no revela si el email no existe — no envía nada, pero tampoco lanza', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.forgotPassword('nadie@b.com')).resolves.toBeUndefined();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(emailClient.send).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('actualiza la contraseña, marca el código usado y revoca refresh tokens existentes', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
      prisma.passwordResetToken.findFirst.mockResolvedValue({ id: 'reset-1' });

      await service.resetPassword('a@b.com', '123456', 'nuevaPassword123');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: expect.any(String) },
      });
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'reset-1' },
        data: { used: true },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revoked: false },
        data: { revoked: true },
      });
    });

    it('mismo error genérico si el email no existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword('nadie@b.com', '123456', 'nuevaPassword123')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('mismo error genérico si el código es incorrecto o ya fue usado/expiró', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
      prisma.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(service.resetPassword('a@b.com', '000000', 'nuevaPassword123')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
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
