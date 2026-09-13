import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CreateZoneDto } from './zone.dto';

export class CreateEventDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  venue!: string;

  @IsDateString()
  startsAt!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'El evento necesita al menos una zona' })
  @ValidateNested({ each: true })
  @Type(() => CreateZoneDto)
  zones!: CreateZoneDto[];
}
