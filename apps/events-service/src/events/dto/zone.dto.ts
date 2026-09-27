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

  /// Fase G (mapa de establecimiento): vincula esta zona a un polígono del
  /// mapa del Venue del evento — ver EventsService.assertSectionBelongsToEventVenue
  /// para la validación real (acá solo se chequea el formato).
  @IsOptional()
  @IsString()
  venueSectionId?: string;
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

  @IsOptional()
  @IsString()
  venueSectionId?: string;
}
