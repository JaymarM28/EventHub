import { IsDateString, IsEmail, IsString, MinLength } from 'class-validator';

/** Base compartida — usada también por CreateInternalUserDto (organizador
 * creando STAFF, SUPER_ADMIN creando un ORGANIZADOR). Esos casos NO son
 * un autoregistro, así que `acceptedTerms` (ver PublicRegisterDto) vive
 * aparte y solo aplica al registro público real. */
export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password!: string;

  @IsString()
  @MinLength(1, { message: 'El nombre es obligatorio' })
  firstName!: string;

  @IsString()
  @MinLength(1, { message: 'El apellido es obligatorio' })
  lastName!: string;

  @IsDateString({}, { message: 'Fecha de nacimiento inválida (formato ISO, ej. 2000-01-31)' })
  birthDate!: string;
}
