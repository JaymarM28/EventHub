import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { RawInternalHeaders } from '@event-hub/internal-auth';
import { AddStaffDto } from './dto/add-staff.dto';

export interface CreatedUser {
  id: string;
  email: string;
}

/**
 * Llamada SÍNCRONA a auth-service (mismo patrón que orders-service →
 * tickets-service, Finding 1 del eng review). Reenvía el MISMO header
 * interno que events-service recibió del organizador que llamó a
 * POST /events/:id/staff — auth-service confía en él igual que confiaría
 * en cualquier request que viniera directo del gateway, y además exige
 * que ese contexto tenga rol ORGANIZER/SUPER_ADMIN (defensa en profundidad,
 * ver InternalUsersController).
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

  async createStaffUser(dto: AddStaffDto, headers: RawInternalHeaders): Promise<CreatedUser> {
    try {
      const response = await firstValueFrom(
        this.http.post<CreatedUser>(
          `${this.baseUrl}/internal/users`,
          { ...dto, roles: ['STAFF'] },
          { headers },
        ),
      );
      return response.data;
    } catch (err) {
      throw this.toHttpException(err);
    }
  }

  /** Ver el comentario equivalente en orders-service/tickets-client.service.ts —
   * sin esto, un 409 "ya existe una cuenta con ese email" de auth-service
   * llegaría al organizador como un 500 genérico. */
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
