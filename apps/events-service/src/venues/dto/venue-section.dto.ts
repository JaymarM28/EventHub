import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

/** Un vértice del polígono, normalizado 0.0–1.0 sobre la imagen del mapa. */
export class SectionPointDto {
  @IsNumber()
  x!: number;

  @IsNumber()
  y!: number;
}

export class CreateVenueSectionDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsArray()
  @ArrayMinSize(3, { message: 'Una sección necesita al menos 3 puntos para formar un polígono' })
  @ValidateNested({ each: true })
  @Type(() => SectionPointDto)
  points!: SectionPointDto[];
}

export class UpdateVenueSectionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(3, { message: 'Una sección necesita al menos 3 puntos para formar un polígono' })
  @ValidateNested({ each: true })
  @Type(() => SectionPointDto)
  points?: SectionPointDto[];
}
