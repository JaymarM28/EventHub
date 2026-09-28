import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Tope de 10 por orden — ver el comentario equivalente en
 * tickets-service/reservations/dto/create-reservation.dto.ts. `quantity`
 * y `seatIds` son mutuamente excluyentes (Fase 2, asiento individual):
 * con `seatIds`, la cantidad real es `seatIds.length`, no hace falta
 * mandar ambos — ver OrdersController.checkout. */
export class CreateOrderDto {
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

  /** #23 — opcional, se valida/canjea contra events-service en el checkout. */
  @IsOptional()
  @IsString()
  discountCode?: string;
}
