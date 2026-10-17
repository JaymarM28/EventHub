import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { InternalHeaders, InternalUser, InternalUserContext, Public, RawInternalHeaders, Roles } from '@event-hub/internal-auth';
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
    private readonly config: ConfigService,
  ) {}

  @Post('checkout')
  checkout(
    @Body() dto: CreateOrderDto,
    @InternalUser() user: InternalUserContext,
    @InternalHeaders() headers: RawInternalHeaders,
  ) {
    if (dto.seatIds !== undefined && dto.quantity !== undefined) {
      throw new BadRequestException('Enviá quantity o seatIds, no ambos');
    }
    if (dto.seatIds === undefined && dto.quantity === undefined) {
      throw new BadRequestException('Falta quantity o seatIds');
    }
    return this.ordersService.checkout(
      dto.zoneId,
      dto.seatIds ?? dto.quantity!,
      user.userId,
      user.email,
      headers,
      dto.discountCode,
    );
  }

  @Get('mine')
  findMine(@InternalUser() user: InternalUserContext) {
    return this.ordersService.findByUser(user.userId);
  }

  /** #22 — soporte al comprador: el organizador ve las órdenes de las
   * zonas de SU evento (resueltas del lado del admin panel/events-service,
   * no acá) antes de poder reembolsar una puntual. */
  @Get('for-zones')
  @Roles('ORGANIZER', 'SUPER_ADMIN')
  findByZones(@Query('zoneIds') zoneIds: string) {
    const ids = zoneIds ? zoneIds.split(',').filter(Boolean) : [];
    return this.ordersService.findByZones(ids);
  }

  @Post(':id/refund')
  @Roles('ORGANIZER', 'SUPER_ADMIN')
  refund(
    @Param('id') id: string,
    @InternalUser() user: InternalUserContext,
    @InternalHeaders() headers: RawInternalHeaders,
  ) {
    return this.ordersService.refund(id, user, headers);
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
    let orderId: string | undefined;
    if (transactionId) {
      try {
        const transaction = await this.wompi.getTransaction(transactionId);
        orderId = transaction.reference;
        if (transaction.status === 'APPROVED') outcome = 'success';
        else if (transaction.status === 'DECLINED' || transaction.status === 'VOIDED' || transaction.status === 'ERROR') {
          outcome = 'failure';
        }
      } catch {
        // best-effort — si Wompi no responde acá, el webhook real todavía
        // va a llegar y confirmar el estado de la orden más tarde.
      }
    }
    // `orderId` viaja en la query (2026-10-01, versión web) para que
    // checkoutReturn pueda reenviarlo a la app Flutter Web y retome el
    // pedido exacto — la app nativa lo ignora (su WebView ya interceptó
    // esta misma navegación ANTES de que el request llegue acá).
    const orderIdQuery = orderId ? `?orderId=${encodeURIComponent(orderId)}` : '';
    res.redirect(302, `/orders/checkout-return/${outcome}${orderIdQuery}`);
  }

  /**
   * Páginas de aterrizaje del checkout — el WebView de la app NATIVA
   * intercepta la navegación hacia esta URL por su path
   * (`/orders/checkout-return/:outcome`) ANTES de que este request llegue
   * a ejecutarse acá (ver payment_webview_screen.dart), así que lo que
   * este handler responda es irrelevante para mobile. Para quien SÍ
   * llega acá de verdad — un navegador real, ej. la versión web
   * (2026-10-01, Next.js) — la página redirige sola de vuelta a
   * `/checkout-return` con el resultado y el orderId, para que retome el
   * pedido exacto.
   */
  @Get('checkout-return/:outcome')
  @Public()
  checkoutReturn(
    @Param('outcome') outcome: string,
    @Query('orderId') orderId: string | undefined,
    @Res() res: Response,
  ) {
    const page = CHECKOUT_RETURN_PAGES[outcome as keyof typeof CHECKOUT_RETURN_PAGES] ?? CHECKOUT_RETURN_PAGES.pending;
    const webAppUrl = this.config.get<string>('WEB_APP_PUBLIC_URL');
    const resumeParams = new URLSearchParams({ outcome, ...(orderId && { orderId }) });
    // Next.js usa rutas normales (sin hash) — ver apps/web/src/app/checkout-return.
    const resumeUrl = webAppUrl ? `${webAppUrl}/checkout-return?${resumeParams.toString()}` : null;

    res.type('html').send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${page.title}</title>
  ${resumeUrl ? `<meta http-equiv="refresh" content="2;url=${resumeUrl}" />` : ''}
</head>
<body style="font-family: -apple-system, sans-serif; text-align: center; padding: 60px 20px; background: #faf9f6;">
  <h1 style="color:#1a1a1a;">${page.title}</h1>
  <p style="color:#555;">${page.message}</p>
  ${resumeUrl ? `<p style="color:#555;">Si no volvés sola, <a href="${resumeUrl}">tocá acá</a>.</p>` : ''}
</body>
</html>
    `.trim());
  }
}
