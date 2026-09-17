import { IsDateString, IsOptional, IsString } from 'class-validator';

/**
 * No incluye `zones` — editar/agregar zonas tiene sus propios endpoints
 * (POST/PATCH /events/:id/zones, ver EventsService.addZone/updateZone)
 * porque la regla de negocio es distinta a un campo de texto: la
 * capacidad nunca puede bajar de lo ya vendido. Borrar una zona no está
 * soportado todavía (decisión explícita, admin panel v1) — si ya tiene
 * boletos vendidos dejaría boletos huérfanos.
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
