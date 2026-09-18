import { IsInt, IsString, Max, Min } from 'class-validator';

/** Tope de 10 por orden (Fase A de DESIGN.md) — sin un límite razonable,
 * nada impide reservar cientos de boletos de una vez desde un solo
 * request y agotar la zona instantáneamente. */
export class CreateReservationDto {
  @IsString()
  zoneId!: string;

  @IsInt()
  @Min(1)
  @Max(10)
  quantity!: number;
}
