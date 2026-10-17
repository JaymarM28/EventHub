import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { PublicRegisterDto } from './dto/public-register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { renderEmailHtml } from './email-template';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: PublicRegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshDto) {
    await this.authService.logout(dto.refreshToken);
  }

  /**
   * Se abre directo desde el cliente de correo (Mail, Gmail, etc.), nunca
   * desde la app — por eso responde HTML plano en vez del JSON del resto
   * del controller, algo legible para un humano tocando un link.
   */
  @Get('verify-email')
  async verifyEmail(@Query('token') token: string, @Res() res: Response) {
    try {
      await this.authService.verifyEmail(token);
      res
        .status(HttpStatus.OK)
        .type('html')
        .send(renderEmailHtml('¡Email confirmado!', '<p style="margin:0;font-size:15px;color:#444;">Ya podés cerrar esta pestaña y volver a la app.</p>'));
    } catch {
      res
        .status(HttpStatus.BAD_REQUEST)
        .type('html')
        .send(renderEmailHtml('Link inválido', '<p style="margin:0;font-size:15px;color:#444;">Este link de verificación es inválido o ya expiró.</p>'));
    }
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    // Mismo mensaje exista o no la cuenta — ver comentario en el service.
    return { message: 'Si el email existe, te enviamos un código para recuperar tu contraseña' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.email, dto.code, dto.newPassword);
    return { message: 'Contraseña actualizada' };
  }
}
