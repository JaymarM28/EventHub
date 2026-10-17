/**
 * Páginas legales públicas (2026-10-01) — hosteadas directo acá porque
 * api-gateway es el único ingreso público de la plataforma (igual criterio
 * que las páginas de checkout-return en orders-service: HTML simple
 * servido inline, sin necesitar un servicio/hosting aparte). Las tiendas
 * de apps (Apple/Google) piden un link público a esto en la ficha —
 * necesitan vivir en una URL estable antes de publicar la app.
 *
 * IMPORTANTE: este texto es un borrador razonable basado en cómo funciona
 * la plataforma hoy, no reemplaza revisión de un abogado — Event Hub
 * procesa pagos y datos personales reales, vale la pena que alguien con
 * título lo revise antes de considerarlo definitivo.
 */

const CONTACT_EMAIL = 'jaymarmurillo@jmalphatech.com';
const LAST_UPDATED = '1 de octubre de 2026';

function renderLegalPage(title: string, bodyHtml: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Event Hub</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      background-color: #f4f3fa;
      margin: 0;
      padding: 40px 20px;
    }
    .wrap { max-width: 680px; margin: 0 auto; background: #fff; border-radius: 20px; padding: 40px; box-shadow: 0 10px 40px rgba(124,111,240,0.12); }
    h1 { font-size: 24px; margin: 0 0 4px; }
    .updated { color: #8b87a8; font-size: 13px; margin: 0 0 28px; }
    h2 { font-size: 17px; margin: 28px 0 8px; }
    p, li { color: #333; font-size: 15px; }
    a { color: #7C6FF0; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${title}</h1>
    <p class="updated">Última actualización: ${LAST_UPDATED}</p>
    ${bodyHtml}
  </div>
</body>
</html>`.trim();
}

export const privacyPolicyHtml = renderLegalPage(
  'Política de privacidad',
  `
  <p>Esta política explica qué datos recolecta Event Hub (en adelante, "la
  plataforma"), para qué los usa, y qué derechos tenés sobre ellos.</p>

  <h2>1. Responsable del tratamiento</h2>
  <p>[Razón social / nombre del titular] — contacto:
  <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>

  <h2>2. Qué datos recolectamos</h2>
  <ul>
    <li>Datos de cuenta: nombre, apellido, email, fecha de nacimiento, y tu
    contraseña (nunca la guardamos en texto plano — se almacena con hash,
    nadie en Event Hub puede verla).</li>
    <li>Historial de compras: qué eventos y zonas compraste, boletos
    emitidos, y si los usaste o fueron reembolsados.</li>
    <li>Si sos organizador: los eventos que publicás y las ventas que
    recibís.</li>
  </ul>

  <h2>3. Datos de pago — qué NO guardamos</h2>
  <p>Event Hub <strong>nunca ve ni almacena los datos de tu tarjeta</strong>.
  El pago se procesa directamente por <strong>Wompi</strong>, nuestro
  proveedor de pagos, en su propio formulario seguro — nosotros solo
  recibimos la confirmación de que el pago se completó.</p>

  <h2>4. Para qué usamos tus datos</h2>
  <ul>
    <li>Crear y administrar tu cuenta.</li>
    <li>Procesar tus compras y emitir tus boletos.</li>
    <li>Enviarte confirmaciones de compra, recordatorios de tus eventos, y
    avisos de reembolso (por email y, si lo activaste, notificaciones
    push).</li>
    <li>Brindar soporte si tenés un problema con una compra.</li>
  </ul>

  <h2>5. Con quién compartimos datos</h2>
  <ul>
    <li><strong>Wompi</strong> — para procesar el pago.</li>
    <li><strong>El organizador del evento</strong> que compraste — ve tu
    nombre y email asociados a tu orden, para poder darte soporte o
    procesar un reembolso si corresponde. No ve tu contraseña ni datos de
    pago.</li>
    <li><strong>Proveedores técnicos</strong> que usamos para operar la
    plataforma (envío de email, notificaciones push) — solo reciben lo
    mínimo necesario para cumplir esa función.</li>
  </ul>
  <p>Nunca vendemos tus datos a terceros.</p>

  <h2>6. Cuánto tiempo conservamos tus datos</h2>
  <p>Mientras tu cuenta esté activa. Si la eliminás, conservamos el
  historial de transacciones el tiempo que exija la normativa fiscal/
  contable aplicable, aunque el resto de tu información personal se borra.</p>

  <h2>7. Tus derechos</h2>
  <p>Conforme a la Ley 1581 de 2012 (Colombia), tenés derecho a conocer,
  actualizar, rectificar y solicitar la supresión de tus datos, y a
  revocar la autorización para su tratamiento. Para ejercerlos, escribinos
  a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>

  <h2>8. Menores de edad</h2>
  <p>La plataforma está dirigida a personas mayores de edad. Si sos menor,
  necesitás el consentimiento de tu padre, madre o tutor para crear una
  cuenta.</p>

  <h2>9. Cambios a esta política</h2>
  <p>Si hacemos cambios importantes, te avisamos dentro de la app antes de
  que entren en vigencia.</p>

  <h2>10. Contacto</h2>
  <p>¿Preguntas sobre tus datos? Escribinos a
  <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
  `,
);

export const termsOfServiceHtml = renderLegalPage(
  'Términos y condiciones',
  `
  <p>Al crear una cuenta o usar Event Hub, aceptás estos términos. Si no
  estás de acuerdo, no uses la plataforma.</p>

  <h2>1. Qué es Event Hub</h2>
  <p>Event Hub es una plataforma que conecta organizadores de eventos con
  compradores de boletos. Facilitamos la publicación de eventos, la venta
  de boletos, y el control de acceso — no organizamos los eventos
  nosotros mismos.</p>

  <h2>2. Tu cuenta</h2>
  <p>Sos responsable de mantener tu contraseña segura y de que los datos
  que nos diste (nombre, email, fecha de nacimiento) sean reales. Si
  detectamos actividad fraudulenta, podemos suspender tu cuenta.</p>

  <h2>3. Compra de boletos</h2>
  <p>El precio que ves en el checkout incluye un cargo por servicio de la
  plataforma, separado del precio que fija el organizador — vas a verlo
  desglosado antes de confirmar el pago. Todos los pagos se procesan en
  pesos colombianos (COP) a través de Wompi.</p>

  <h2>4. Reembolsos y cancelaciones</h2>
  <ul>
    <li>El organizador puede reembolsar una orden puntual, o cancelar el
    evento completo (lo que reembolsa automáticamente a todos los
    compradores).</li>
    <li>Los reembolsos son por el <strong>total de la orden</strong>, sin
    reembolsos parciales.</li>
    <li>Un boleto reembolsado queda invalidado y no se puede usar para
    ingresar al evento.</li>
  </ul>

  <h2>5. Responsabilidad del organizador</h2>
  <p>Cada organizador es responsable de que la información de su evento
  sea veraz (fecha, lugar, cupos) y de cumplir lo que publicita. Event Hub
  es un intermediario — no somos responsables por la realización,
  calidad, o cambios de un evento publicado por un organizador.</p>

  <h2>6. Conducta prohibida</h2>
  <p>No está permitido: revender boletos falsificando su origen,
  manipular o falsificar códigos QR, usar la plataforma para actividades
  fraudulentas, o intentar vulnerar su seguridad.</p>

  <h2>7. Propiedad intelectual</h2>
  <p>El contenido de la plataforma (marca, diseño, software) pertenece a
  Event Hub. El contenido que publica cada organizador (imágenes,
  descripciones de su evento) es de su propiedad.</p>

  <h2>8. Límite de responsabilidad</h2>
  <p>Event Hub no es responsable por daños indirectos derivados del uso de
  la plataforma, incluyendo la cancelación o mala ejecución de un evento
  por parte de un organizador.</p>

  <h2>9. Ley aplicable</h2>
  <p>Estos términos se rigen por las leyes de Colombia.</p>

  <h2>10. Cambios a estos términos</h2>
  <p>Podemos actualizar estos términos — si el cambio es importante, te
  avisamos dentro de la app antes de que entre en vigencia.</p>

  <h2>11. Contacto</h2>
  <p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
  `,
);
