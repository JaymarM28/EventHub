import { ArrayMinSize, ArrayUnique, IsArray, IsInt, IsString, Min, MinLength } from 'class-validator';

/**
 * Genera `rowLabels.length * seatsPerRow` butacas de una sola vez — el
 * organizador nunca las marca una por una (ver comentario en Seat,
 * schema.prisma). Todas las filas tienen el mismo número de asientos en
 * esta v1; filas de largo distinto queda para una iteración futura si
 * hace falta.
 */
export class GenerateSeatsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  rowLabels!: string[];

  @IsInt()
  @Min(1)
  seatsPerRow!: number;
}
