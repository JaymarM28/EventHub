import { ArrayNotEmpty, IsArray, IsEnum } from 'class-validator';
import { Role } from '../../../generated/prisma-client';
import { RegisterDto } from './register.dto';

/** Mismos datos que un registro público + los roles explícitos que le da
 * quien lo crea (el organizador, vía events-service) — nunca elegibles
 * por quien se auto-registra en /auth/register. */
export class CreateInternalUserDto extends RegisterDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(Role, { each: true })
  roles!: Role[];
}
