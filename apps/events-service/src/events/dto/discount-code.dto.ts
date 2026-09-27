import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { DiscountType } from '../../../generated/prisma-client';

export class CreateDiscountCodeDto {
  @IsString()
  @Length(3, 20)
  code!: string;

  @IsEnum(DiscountType)
  type!: DiscountType;

  /// Validado en el service según `type` (PERCENTAGE: 0-100, FIXED: >0) —
  /// el rango depende de un campo hermano, class-validator no lo puede
  /// expresar declarativamente sin un validador custom para un caso así
  /// de puntual.
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  value!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;
}

export class UpdateDiscountCodeDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class RedeemDiscountCodeDto {
  @IsString()
  code!: string;
}
