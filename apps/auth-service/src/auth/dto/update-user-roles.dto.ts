import { ArrayMinSize, IsEnum } from 'class-validator';
import { Role } from '../../../generated/prisma-client';

export class UpdateUserRolesDto {
  @IsEnum(Role, { each: true })
  @ArrayMinSize(1, { message: 'Un usuario debe tener al menos un rol' })
  roles!: Role[];
}
