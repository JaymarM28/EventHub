import { IsString } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  zoneId!: string;
}
