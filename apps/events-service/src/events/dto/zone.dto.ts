import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateZoneDto {
  @IsString()
  name!: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsInt()
  @Min(1)
  capacity!: number;
}

/** Ver EventsService.updateZone — `capacity` nunca puede bajar de lo ya
 * vendido, chequeado ahí (no es una regla de formato, no va acá). */
export class UpdateZoneDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}
