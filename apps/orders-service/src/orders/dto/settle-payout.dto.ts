import { ArrayMinSize, IsArray, IsOptional, IsString, MinLength } from 'class-validator';

/** #24 — liquidación MANUAL (ver TODOS.md #13): `externalReference` es el
 * comprobante de la transferencia que el SUPER_ADMIN ya hizo por fuera de
 * la plataforma (número de transacción bancaria, no un id de Wompi
 * Payouts todavía — eso queda para cuando se automatice). */
export class SettlePayoutDto {
  @IsString()
  organizerId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  zoneIds!: string[];

  @IsString()
  @MinLength(1)
  externalReference!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
