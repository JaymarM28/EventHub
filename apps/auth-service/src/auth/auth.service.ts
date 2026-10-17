import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { PublicRegisterDto } from './dto/public-register.dto';
import { LoginDto } from './dto/login.dto';
import { CreateInternalUserDto } from './dto/create-internal-user.dto';
import { Role } from '../../generated/prisma-client';
import { EmailClientService } from './email-client.service';
import { renderEmailHtml } from './email-template';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const SALT_ROUNDS = 12;
const REFRESH_TOKEN_BYTES = 64;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // 30min — más corto que verificación, es más sensible

/**
 * Estrategia de revocación (Open Question de DESIGN.md, resuelta en el eng
 * review de este paso): access token de vida corta validado solo por firma
 * (rápido, sin tocar DB en cada request — encaja con que api-gateway valida
 * una sola vez), refresh token guardado hasheado en Postgres y rotado en
 * cada uso. Reusar un refresh token ya rotado es señal de robo: revoca toda
 * la sesión del usuario.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly emailClient: EmailClientService,
  ) {}

  async register(dto: PublicRegisterDto): Promise<TokenPair> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese email');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        birthDate: new Date(dto.birthDate),
        // ValidationPipe ya garantizó que dto.acceptedTerms === true antes
        // de llegar acá (ver PublicRegisterDto) — esto solo registra CUÁNDO.
        termsAcceptedAt: new Date(),
      },
    });

    // Best-effort (ver EmailClientService) — un email de bienvenida que
    // falla en enviarse no debe impedir que la cuenta recién creada quede
    // utilizable de inmediato.
    await this.sendVerificationEmail(user.id, user.email);

    return this.issueTokens(user.id, user.email, user.roles);
  }

  /** Separado de register() para poder reusarlo desde un futuro
   * "reenviar verificación" sin duplicar la lógica de generar el token. */
  private async sendVerificationEmail(userId: string, email: string): Promise<void> {
    const rawToken = randomBytes(32).toString('hex');
    await this.prisma.emailVerificationToken.create({
      data: {
        tokenHash: this.hashToken(rawToken),
        userId,
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      },
    });

    const verifyUrl = `${this.config.getOrThrow<string>('API_PUBLIC_URL')}/auth/verify-email?token=${rawToken}`;
    await this.emailClient.send(
      email,
      'Confirma tu email',
      renderEmailHtml(
        'Confirma tu email',
        `<p style="margin:0 0 20px;font-size:15px;color:#444;">Gracias por registrarte en Event Hub. Tocá el botón para confirmar tu email.</p>
         <a href="${verifyUrl}" style="display:inline-block;background:#5b4fe9;color:white;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:14px;">Confirmar email</a>`,
      ),
    );
  }

  /**
   * Abierto desde el link del correo (sin sesión iniciada) — por eso es
   * público y no toma un userId de contexto, solo el token. Se borra el
   * token al usarlo (no solo se marca) para no dejar basura acumulándose:
   * a diferencia de RefreshToken, este no tiene ningún valor una vez
   * consumido ni para auditoría.
   */
  async verifyEmail(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.expiresAt < new Date()) {
      throw new BadRequestException('El link de verificación es inválido o expiró');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: stored.userId }, data: { emailVerifiedAt: new Date() } }),
      this.prisma.emailVerificationToken.delete({ where: { id: stored.id } }),
    ]);
  }

  /**
   * Nunca revela si el email existe (mismo criterio anti-enumeración que
   * login) — el controller siempre responde el mismo mensaje genérico,
   * exista o no la cuenta. Si no existe, esta función simplemente no
   * hace nada.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const code = randomInt(100_000, 1_000_000).toString(); // 6 dígitos, sin ambigüedad de cero a la izquierda
    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash: this.hashToken(code),
        userId: user.id,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    await this.emailClient.send(
      user.email,
      'Código para recuperar tu contraseña',
      renderEmailHtml(
        'Código para recuperar tu contraseña',
        `<p style="margin:0 0 16px;font-size:15px;color:#444;">Usá este código en la app, expira en 30 minutos:</p>
         <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:6px;color:#5b4fe9;">${code}</p>`,
      ),
    );
  }

  /**
   * Mismo mensaje de error para "email no existe", "código incorrecto" y
   * "código expirado/usado" — evita que alguien confirme por este medio
   * qué emails están registrados o ande probando códigos a fuerza bruta
   * con feedback distinto por caso.
   */
  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    const genericError = () => new UnauthorizedException('Código inválido o expirado');

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw genericError();

    const tokenHash = this.hashToken(code);
    const stored = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, tokenHash, used: false, expiresAt: { gt: new Date() } },
    });
    if (!stored) throw genericError();

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: stored.id }, data: { used: true } }),
      // Cambiar la contraseña invalida todas las sesiones existentes —
      // mismo principio que la detección de reuso de refresh token: si
      // alguien más tenía acceso a la cuenta, esto lo corta.
      this.prisma.refreshToken.updateMany({ where: { userId: user.id, revoked: false }, data: { revoked: true } }),
    ]);
  }

  /**
   * Usado solo por el endpoint interno `POST /internal/users` — un
   * organizador da de alta a alguien de su equipo de STAFF (ver
   * events-service, EventsController.addStaff). A diferencia de
   * `register()`, no emite tokens: la cuenta recién creada inicia sesión
   * por su cuenta vía /auth/login con las credenciales que le dio el
   * organizador.
   */
  async createWithRoles(dto: CreateInternalUserDto): Promise<{ id: string; email: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese email');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        birthDate: new Date(dto.birthDate),
        roles: dto.roles,
      },
    });

    return { id: user.id, email: user.email };
  }

  /**
   * Fase E (transferencia de boleto): tickets-service necesita resolver el
   * userId de un email antes de reasignar el dueño de un ticket — no
   * expone el password hash ni nada más, solo lo mínimo para completar la
   * transferencia.
   */
  async findByEmail(email: string): Promise<{ id: string; email: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException(`No existe una cuenta con el email ${email}`);
    }
    return { id: user.id, email: user.email };
  }

  /**
   * Panel de SUPER_ADMIN (plataforma) — lista TODOS los usuarios, sin
   * passwordHash. A diferencia de todo lo demás en este servicio, no hay
   * scoping por organizador: es la vista de "toda la plataforma".
   */
  async listUsers() {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    return users.map(({ passwordHash: _passwordHash, ...user }) => user);
  }

  /**
   * Reemplaza el arreglo de roles completo (no un toggle individual) —
   * más simple de razonar y evita estados intermedios raros como "sin
   * ningún rol" (el DTO ya exige al menos uno).
   */
  async updateRoles(userId: string, roles: Role[]): Promise<{ id: string; email: string; roles: Role[] }> {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      throw new NotFoundException(`Usuario ${userId} no existe`);
    }
    const user = await this.prisma.user.update({ where: { id: userId }, data: { roles } });
    return { id: user.id, email: user.email, roles: user.roles };
  }

  /**
   * Fase B (notificaciones reales): notifications-service solo tiene el
   * userId del evento de dominio (order.paid, ticket.issued) — necesita
   * resolver el email real para poder enviarlo. Mismo shape que
   * findByEmail, sentido inverso.
   */
  async findById(id: string): Promise<{ id: string; email: string }> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuario ${id} no existe`);
    }
    return { id: user.id, email: user.email };
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    // Mismo mensaje de error para email inexistente y password incorrecta —
    // evita filtrar qué emails están registrados (enumeration attack).
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return this.issueTokens(user.id, user.email, user.roles);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    if (stored.revoked) {
      // Reuso de un token ya rotado: posible robo. Revocar toda la sesión.
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revoked: false },
        data: { revoked: true },
      });
      throw new UnauthorizedException(
        'Refresh token ya utilizado — sesión revocada por seguridad',
      );
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    return this.issueTokens(
      stored.user.id,
      stored.user.email,
      stored.user.roles,
    );
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revoked: true },
    });
  }

  private async issueTokens(
    userId: string,
    email: string,
    roles: string[],
  ): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, roles },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: this.config.get<string>(
          'JWT_EXPIRES_IN',
          '15m',
        ) as SignOptions['expiresIn'],
      },
    );

    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const tokenHash = this.hashToken(refreshToken);
    const refreshExpiresIn = this.config.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '7d',
    );

    await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId,
        expiresAt: new Date(Date.now() + parseDurationMs(refreshExpiresIn)),
      },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

/** Parser mínimo de duraciones tipo "7d", "15m", "3600s" a milisegundos. */
function parseDurationMs(duration: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    throw new Error(`Formato de duración inválido: "${duration}"`);
  }
  const value = Number(match[1]);
  const unit = match[2];
  const unitMs: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * unitMs[unit];
}
