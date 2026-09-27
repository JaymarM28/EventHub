import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateVenueDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  address!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}
