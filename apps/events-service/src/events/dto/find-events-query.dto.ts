import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { EventCategory } from '../../../generated/prisma-client';

/**
 * Todos opcionales — sin ningún filtro, GET /events se comporta como
 * antes (Fase C #19 es aditivo, no reemplaza el listado simple).
 * `maxPrice` filtra por "tiene AL MENOS una zona a ese precio o menos"
 * (semántica "desde $X"), no el precio promedio del evento — un evento
 * con zonas de $20 y $200 sí aparece si buscás "hasta $50".
 */
export class FindEventsQueryDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsEnum(EventCategory)
  category?: EventCategory;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;
}
