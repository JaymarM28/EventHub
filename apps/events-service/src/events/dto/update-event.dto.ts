import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUrl, Length } from 'class-validator';
import { EventCategory } from '../../../generated/prisma-client';

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
  @IsString()
  venueId?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsEnum(EventCategory)
  category?: EventCategory;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsUrl()
  coverImageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  galleryImageUrls?: string[];
}
