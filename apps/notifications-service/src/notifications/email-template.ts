/**
 * Plantilla única a propósito — a diferencia de un sistema con muchos
 * tipos de email (ver referencia de payroll-system-angular), acá el
 * "layout" (header, cierre) es siempre el mismo y lo que cambia es el
 * `body` HTML que arma cada caller. Colores alineados al morado de marca
 * de la Fase F (`#7C6FF0`/`#9B90F5`, ver app_theme.dart) — el fondo del
 * CUERPO del correo se mantiene claro a propósito (no el fondo oscuro
 * `#0D0D12` de la app): el soporte de dark mode en clientes de email es
 * inconsistente, un fondo claro es la apuesta segura para que el texto
 * siempre sea legible.
 */
export function renderEmailHtml(subject: string, body: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; background-color: #f4f3fa; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 40px rgba(124,111,240,0.12);">
    <div style="background: linear-gradient(135deg, #7C6FF0, #9B90F5); color: white; padding: 32px 28px; text-align: center;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 700;">Event Hub</h1>
    </div>
    <div style="padding: 28px;">
      <h2 style="margin: 0 0 16px; font-size: 18px;">${subject}</h2>
      ${body}
    </div>
    <div style="background-color: #f3f2ff; padding: 18px 28px; text-align: center;">
      <p style="margin: 0; color: #8b87a8; font-size: 12px;">Mensaje automático — por favor no respondas a este correo.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Bloque de detalles del evento/compra (correos de pago confirmado y
 * boleto listo) — reemplaza el párrafo plano de antes que mostraba el
 * `orderId`/`ticketId` en crudo (feedback del usuario: "ese correo que se
 * envía está muy feo"). Un comprador no necesita ver un UUID; sí necesita
 * ver QUÉ compró, CUÁNDO es y CUÁNTO pagó.
 */
export function renderTicketDetails(details: {
  eventTitle: string;
  venue: string;
  city: string | null;
  startsAt: Date;
  zoneName: string;
  quantity: number;
  totalAmount: string;
  currency: string;
}): string {
  const dateLabel = new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(details.startsAt);
  const locationLabel = details.city ? `${details.venue}, ${details.city}` : details.venue;

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:8px 0;color:#8b87a8;font-size:13px;">${label}</td>
      <td style="padding:8px 0;color:#1a1a1a;font-size:13px;font-weight:600;text-align:right;">${value}</td>
    </tr>`;

  return `
    <p style="margin:0 0 20px;font-size:15px;color:#444;">Tu boleto para <strong>${details.eventTitle}</strong> está confirmado.</p>
    <table style="width:100%;border-collapse:collapse;background:#faf9ff;border-radius:14px;padding:18px 20px;border:1px solid #ece9fb;" cellpadding="0" cellspacing="0">
      <tr><td colspan="2" style="padding:10px 0 4px;">
        <div style="font-size:16px;font-weight:700;color:#1a1a1a;">${details.eventTitle}</div>
      </td></tr>
      <tr><td colspan="2" style="padding:0 0 10px;border-bottom:1px solid #ece9fb;">
        <div style="font-size:13px;color:#8b87a8;">${dateLabel} · ${locationLabel}</div>
      </td></tr>
      ${row('Zona', details.zoneName)}
      ${row('Cantidad', `${details.quantity} ${details.quantity === 1 ? 'boleto' : 'boletos'}`)}
      ${row('Total pagado', `$${Number(details.totalAmount).toLocaleString('es-CO')} ${details.currency}`)}
    </table>
  `;
}
