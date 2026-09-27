import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  ValidateNested,
} from 'class-validator';
import { EventCategory } from '../../../generated/prisma-client';
import { CreateZoneDto } from './zone.dto';

export class CreateEventDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  venue!: string;

  @IsString()
  city!: string;

  @IsEnum(EventCategory)
  category!: EventCategory;

  /// ISO 4217, ej. "COP", "USD" — opcional, default COP en el schema.
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsDateString()
  startsAt!: string;

  /// Fase F (#41): URL directa nada más, sin subida de binarios — ver
  /// comentario en schema.prisma.
  @IsOptional()
  @IsUrl()
  coverImageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  galleryImageUrls?: string[];

  @IsArray()
  @ArrayMinSize(1, { message: 'El evento necesita al menos una zona' })
  @ValidateNested({ each: true })
  @Type(() => CreateZoneDto)
  zones!: CreateZoneDto[];
}
