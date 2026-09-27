import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Tope de 10 por orden (Fase A de DESIGN.md) — sin un límite razonable,
 * nada impide reservar cientos de boletos de una vez desde un solo
 * request y agotar la zona instantáneamente. `quantity` y `seatIds` son
 * mutuamente excluyentes (ver ReservationsController): zonas sin butacas
 * generadas siguen reservando por cantidad contra un cupo numérico
 * (`reserve`); zonas CON butacas reservan puntualmente (`reserveSeats`,
 * Fase 2). El controller decide cuál llamar según cuál de los dos vino. */
export class CreateReservationDto {
  @IsString()
  zoneId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  quantity?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  seatIds?: string[];
}
