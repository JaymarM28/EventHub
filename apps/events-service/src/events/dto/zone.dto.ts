import { IsInt, IsNumber, IsString, Min } from 'class-validator';

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
