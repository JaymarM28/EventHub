import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_SIGNATURE_HEADER,
  signInternalContext,
} from '@event-hub/internal-auth';

export interface FoundUser {
  id: string;
  email: string;
}

/**
 * Caso distinto a los demás clientes internos del proyecto (events→auth,
 * tickets→auth): esos reenvían el header firmado de la request HTTP
 * original de un usuario final. Acá no hay ninguna — el consumidor de
 * RabbitMQ (NotificationsConsumer) reacciona a un evento de dominio, sin
 * request en curso. Como cualquier servicio que conoce INTERNAL_AUTH_SECRET
 * puede firmar un contexto válido (es el mismo mecanismo de confianza que
 * usa api-gateway), este servicio firma uno propio de identidad "sistema"
 * para poder llamar al endpoint interno de auth-service.
 */
@Injectable()
export class UsersClientService {
  private readonly baseUrl: string;
  private readonly internalAuthSecret: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.baseUrl = config.getOrThrow<string>('AUTH_SERVICE_URL');
    this.internalAuthSecret = config.getOrThrow<string>('INTERNAL_AUTH_SECRET');
  }

  async findById(userId: string): Promise<FoundUser> {
    const { payload, signature } = signInternalContext(
      { userId: 'system:notifications-service', email: 'system@event-hub.internal', roles: ['SUPER_ADMIN'], validatedAt: Date.now() },
      this.internalAuthSecret,
    );

    try {
      const response = await firstValueFrom(
        this.http.get<FoundUser>(`${this.baseUrl}/internal/users/${userId}`, {
          headers: {
            [INTERNAL_CONTEXT_HEADER]: payload,
            [INTERNAL_SIGNATURE_HEADER]: signature,
          },
        }),
      );
      return response.data;
    } catch (err) {
      throw this.toHttpException(err);
    }
  }

  private toHttpException(err: unknown): HttpException {
    const axiosErr = err as AxiosError<{ message?: string }>;
    if (axiosErr.response) {
      const status = axiosErr.response.status;
      const message = axiosErr.response.data?.message ?? 'Error en auth-service';
      return new HttpException(message, status);
    }
    return new HttpException('auth-service no disponible', HttpStatus.SERVICE_UNAVAILABLE);
  }
}
