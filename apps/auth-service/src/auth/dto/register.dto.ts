import { IsDateString, IsEmail, IsString, MinLength } from 'class-validator';

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
