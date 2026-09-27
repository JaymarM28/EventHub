import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { RawInternalHeaders } from '@event-hub/internal-auth';

export interface FoundUser {
  id: string;
  email: string;
}

/**
 * Mismo patrón que events-service/auth-client.service.ts: llamada síncrona
 * service-to-service reenviando el header interno firmado del usuario que
 * originó la petición (el dueño del boleto que quiere transferirlo). Un
 * 404 de auth-service ("no existe cuenta con ese email") debe llegar al
 * comprador tal cual, no como un 500 genérico.
 */
@Injectable()
export class AuthClientService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.baseUrl = config.getOrThrow<string>('AUTH_SERVICE_URL');
  }

  async findByEmail(email: string, headers: RawInternalHeaders): Promise<FoundUser> {
    try {
      const response = await firstValueFrom(
        this.http.get<FoundUser>(`${this.baseUrl}/internal/users/by-email`, {
          params: { email },
          headers,
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
