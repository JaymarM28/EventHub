import { IsDateString, IsOptional, IsString } from 'class-validator';

/**
 * No incluye `zones` — cambiar el inventario de zonas de un evento ya
 * publicado es una operación con implicaciones de negocio (¿qué pasa con
 * los boletos ya vendidos de una zona eliminada?) que se maneja aparte
 * cuando exista tickets-service (paso 5). Por ahora, actualizar zonas
 * requiere crear un evento nuevo.
 */
export class UpdateEventDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  venue?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;
}
