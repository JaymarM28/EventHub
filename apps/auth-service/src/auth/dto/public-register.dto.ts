import { Equals } from 'class-validator';
import { RegisterDto } from './register.dto';

/**
 * Legal (2026-10-01) — solo para el autoregistro público real
 * (POST /auth/register). A diferencia de CreateInternalUserDto (un
 * organizador dando de alta STAFF, o SUPER_ADMIN creando un ORGANIZADOR),
 * acá SÍ es la persona misma creando su cuenta, así que es el único lugar
 * donde tiene sentido exigir la aceptación.
 *
 * `@Equals(true)` rechaza tanto la ausencia del campo como un `false`
 * literal — no hay forma de registrarse sin aceptar de verdad (ver
 * checkbox obligatorio en register_screen.dart, mobile).
 */
export class PublicRegisterDto extends RegisterDto {
  @Equals(true, { message: 'Tenés que aceptar los Términos y la Política de Privacidad' })
  acceptedTerms!: boolean;
}
