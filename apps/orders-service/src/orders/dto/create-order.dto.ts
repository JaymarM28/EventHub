import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Tope de 10 por orden — ver el comentario equivalente en
 * tickets-service/reservations/dto/create-reservation.dto.ts. */
export class CreateOrderDto {
  @IsString()
  zoneId!: string;

  @IsInt()
  @Min(1)
  @Max(10)
  quantity!: number;

  /** #23 — opcional, se valida/canjea contra events-service en el checkout. */
  @IsOptional()
  @IsString()
  discountCode?: string;
}
