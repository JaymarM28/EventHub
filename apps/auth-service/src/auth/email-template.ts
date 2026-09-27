/**
 * Copia propia de la plantilla de notifications-service (mismo criterio
 * que la sync de zonas entre servicios: cada uno es dueño de su copia de
 * lo que necesita, sin importar cross-servicio para algo tan chico).
 */
export function renderEmailHtml(subject: string, bodyHtml: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; background-color: #faf9f6; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.06);">
    <div style="background-color: #5b4fe9; color: white; padding: 32px 28px; text-align: center;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 700;">Event Hub</h1>
    </div>
    <div style="padding: 28px;">
      <h2 style="margin: 0 0 12px; font-size: 17px;">${subject}</h2>
      ${bodyHtml}
    </div>
    <div style="background-color: #f3f2ff; padding: 18px 28px; text-align: center;">
      <p style="margin: 0; color: #8b87a8; font-size: 12px;">Mensaje automático — por favor no respondas a este correo.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
