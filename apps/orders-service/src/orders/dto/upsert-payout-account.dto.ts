import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

export enum BankAccountTypeDto {
  SAVINGS = 'SAVINGS',
  CHECKING = 'CHECKING',
}

/** #24 — datos que Wompi Payouts pide para dispersar una transferencia
 * (ver TODOS.md #13): cuenta bancaria + identidad del beneficiario. Se
 * cargan una vez desde el admin panel, self-service por el organizador. */
export class UpsertPayoutAccountDto {
  @IsEnum(BankAccountTypeDto)
  accountType!: BankAccountTypeDto;

  @IsString()
  @MinLength(4)
  accountNumber!: string;

  @IsString()
  @MinLength(1)
  bankCode!: string;

  @IsString()
  @MinLength(1)
  bankName!: string;

  @IsString()
  @MinLength(1)
  legalIdType!: string;

  @IsString()
  @MinLength(4)
  legalId!: string;

  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsEmail()
  email!: string;
}
