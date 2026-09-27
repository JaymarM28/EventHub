import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { InternalHeaders, InternalUser, InternalUserContext, Public, RawInternalHeaders } from '@event-hub/internal-auth';
import { OrdersService } from './orders.service';
import { WompiClientService } from './wompi-client.service';
import { CreateOrderDto } from './dto/create-order.dto';

const CHECKOUT_RETURN_PAGES: Record<'success' | 'failure' | 'pending', { title: string; message: string }> = {
  success: { title: '¡Pago recibido!', message: 'Ya podés cerrar esta ventana y volver a la app — tu boleto está en camino.' },
  failure: { title: 'El pago no se completó', message: 'Podés cerrar esta ventana e intentar de nuevo desde la app.' },
  pending: { title: 'Pago en revisión', message: 'Estamos revisando tu pago. Cerrá esta ventana y revisá la app en unos minutos.' },
};

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly wompi: WompiClientService,
  ) {}

  @Post('checkout')
  checkout(
    @Body() dto: CreateOrderDto,
    @InternalUser() user: InternalUserContext,
    @InternalHeaders() headers: RawInternalHeaders,
  ) {
    return this.ordersService.checkout(dto.zoneId, dto.quantity, user.userId, user.email, headers, dto.discountCode);
  }

  @Get('mine')
  findMine(@InternalUser() user: InternalUserContext) {
    return this.ordersService.findByUser(user.userId);
  }

  /**
   * Llamado por Wompi, nunca por un usuario final — @Public() a propósito.
   * `OrdersService.handleWompiWebhook` verifica el checksum criptográfico
   * del evento ANTES de confiar en nada de su contenido, y aun así vuelve
   * a consultar la API de Wompi para la confirmación real (ver
   * WompiClientService.getTransaction) — el checksum es defensa en
   * profundidad, no el único mecanismo de confianza.
   */
  @Post('webhooks/wompi')
  @Public()
  @HttpCode(200) // Wompi espera exactamente 200 — @Post por default da 201 en Nest.
  async wompiWebhook(
    @Body()
    body: {
      data?: { transaction?: { id?: string; status?: string; reference?: string } };
      signature?: { properties?: string[]; checksum?: string };
      timestamp?: number;
    },
  ) {
    await this.ordersService.handleWompiWebhook(body);
    return { received: true };
  }

  /**
   * `redirect-url` del Widget/Checkout Web de Wompi — a diferencia de
   * Mercado Pago (que redirige directo a una de las tres páginas de
   * resultado), Wompi solo agrega `?id=<transactionId>` a esta URL y deja
   * que el comercio decida el resultado. Se re-consulta esa transacción
   * (best-effort, solo para elegir qué página mostrar — la confirmación
   * real de pago sigue siendo el webhook, nunca esto) y se redirige a la
   * página correspondiente, reusando el mismo mecanismo de detección por
   * URL que ya tenía la app (`/orders/checkout-return/:outcome`).
   */
  @Get('checkout-return/wompi')
  @Public()
  async wompiCheckoutReturn(@Query('id') transactionId: string | undefined, @Res() res: Response) {
    let outcome: 'success' | 'failure' | 'pending' = 'pending';
    if (transactionId) {
      try {
        const transaction = await this.wompi.getTransaction(transactionId);
        if (transaction.status === 'APPROVED') outcome = 'success';
        else if (transaction.status === 'DECLINED' || transaction.status === 'VOIDED' || transaction.status === 'ERROR') {
          outcome = 'failure';
        }
      } catch {
        // best-effort — si Wompi no responde acá, el webhook real todavía
        // va a llegar y confirmar el estado de la orden más tarde.
      }
    }
    res.redirect(302, `/orders/checkout-return/${outcome}`);
  }

  /**
   * Páginas de aterrizaje del checkout — el WebView de la app detecta la
   * navegación a esta URL por su path (`/orders/checkout-return/:outcome`)
   * para saber cuándo cerrarse; el contenido HTML es solo para el caso de
   * que alguien la vea manualmente en un navegador real.
   */
  @Get('checkout-return/:outcome')
  @Public()
  checkoutReturn(@Param('outcome') outcome: string, @Res() res: Response) {
    const page = CHECKOUT_RETURN_PAGES[outcome as keyof typeof CHECKOUT_RETURN_PAGES] ?? CHECKOUT_RETURN_PAGES.pending;
    res.type('html').send(`
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8" /><title>${page.title}</title></head>
<body style="font-family: -apple-system, sans-serif; text-align: center; padding: 60px 20px; background: #faf9f6;">
  <h1 style="color:#1a1a1a;">${page.title}</h1>
  <p style="color:#555;">${page.message}</p>
</body>
</html>
    `.trim());
  }
}
