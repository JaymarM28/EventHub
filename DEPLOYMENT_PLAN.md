# Plan de despliegue a producción

Orden acordado con el usuario (2026-10-01, reordenado el mismo día para
adelantar la versión web). Cada fase depende de que la anterior esté
cerrada, salvo donde se indique explícitamente que se puede avanzar en
paralelo.

**Dominio y HTTPS: ✅ ya resuelto por el usuario.** Dominio propio con
certificado — queda pendiente apuntar el DNS cuando se elija el hosting
del backend (Fase 4) y reemplazar el túnel temporal de Cloudflare
(`API_PUBLIC_URL` en orders-service, y la URL de webhook de Wompi) por la
URL real y estable (TODOS.md #7).

---

## Fase 1 — Legal

**Por qué va primero:** sin esto no se puede ni publicar en las tiendas de
apps (lo exigen como requisito de ficha) ni operar tranquilos procesando
pagos y datos personales reales (nombre, email, fecha de nacimiento,
historial de compras).

**Qué hace falta:**
1. **Política de privacidad** — qué datos se recolectan, para qué, cuánto
   se guardan, y que Event Hub **nunca** ve ni guarda datos de tarjeta
   (eso lo procesa Wompi directamente).
2. **Términos y condiciones** — política de reembolsos (ya construida,
   #22), responsabilidad del organizador vs. la plataforma, edad mínima.
3. Ambos documentos necesitan una **URL pública real** antes de la Fase 5
   (las tiendas de apps piden el link en la ficha) y antes de la Fase 2
   (el checkbox de aceptación de la app enlaza a estas páginas).
4. Colombia tiene régimen propio de protección de datos (Ley 1581 de 2012,
   Habeas Data) — si el volumen de usuarios crece, puede aplicar registro
   ante la SIC.

**Resuelto (2026-10-01):**
- Páginas públicas en `api-gateway` (`/legal/privacy`, `/legal/terms`) —
  HTML servido directo, sin depender de otro hosting.
- Checkbox de aceptación obligatorio en el registro de la app
  (`PublicRegisterDto.acceptedTerms`, backend rechaza con 400 si no viene
  `true`) — queda registrado `User.termsAcceptedAt` por cuenta.
- **Pendiente:** el borrador de ambos documentos es razonable pero **no
  reemplaza revisión legal real** — esto maneja dinero de terceros, vale
  la pena que un abogado lo revise antes de considerarlo definitivo.

---

## Fase 2 — Versión web de la app (Next.js)

**Por qué se adelantó:** no depende de tener el backend de producción
listo (apunta al mismo gateway que usa la app hoy, y cambia de endpoint
después, igual que la app nativa) — se puede construir ya.

**Decisión tomada (2026-10-01):** se probó **Flutter Web** primero (reusa
toda la lógica Dart ya escrita) pero no convenció en las pruebas — se
descartó a favor de un **sitio nuevo en Next.js**, construido desde cero
en React/TypeScript, consumiendo la misma API del gateway. Más esfuerzo
que reusar Flutter, pero mejor SEO real (páginas de evento indexables en
Google, clave para TODOS.md #10) y una experiencia más nativa de web.

Lo del backend para el flujo de pago (orders-service: `WEB_APP_PUBLIC_URL`,
`orderId` reenviado en el redirect de Wompi) **se mantiene** — es
independiente del framework del frontend, cualquier sitio web necesita lo
mismo para retomar el pedido al volver del checkout.

Esta pieza también resuelve TODOS.md #10 (compartir evento) — hoy no
existe ningún link público al que alguien sin la app pueda entrar.

**Depende de:** Fase 1 (el checkbox de aceptación y los links legales
también aplican acá).

---

## Fase 3 — Monitoreo/errores + CI/CD (GitHub Actions)

**Monitoreo/errores:**
1. Error tracking (ej. Sentry) en los 7 servicios de backend + admin panel
   + mobile/web — hoy, si algo revienta en producción, nadie se entera
   hasta que un usuario se queja.
2. Uptime monitoring (ej. UptimeRobot, Better Stack) sobre el api-gateway
   y el webhook de Wompi.
3. Logs centralizados — hoy cada servicio solo loguea a su propia consola
   local.

**CI/CD con GitHub Actions:**
1. Workflow de **tests**: correr `jest` de cada uno de los 7 servicios en
   cada PR/push a main (ya existen y pasan localmente — falta
   automatizarlos).
2. Workflow de **build/typecheck**: `tsc --noEmit` por servicio, `vite
   build` del admin panel, `flutter analyze` + `flutter test`.
3. Workflow de **deploy**: automatizar el despliegue a donde se decida
   hostear el backend. **Esto requiere elegir el hosting primero** —
   Railway/Render (más simple) vs. AWS/DigitalOcean/Fly.io (más control).
   Los 7 servicios necesitan Dockerfiles propios — hoy solo la infra
   (Postgres/Redis/RabbitMQ) está containerizada (`docker-compose.yml`).
4. Postgres/Redis/RabbitMQ como servicios **gestionados** en producción.

**Depende de:** nada bloqueante — se puede trabajar en paralelo con la
Fase 2.

---

## Fase 4 — Credenciales de producción de Wompi (el usuario se encarga)

El usuario gestiona directamente con Wompi el proceso de verificación de
negocio (cuenta bancaria, datos legales de la empresa) para pasar de
sandbox a producción.

**Mi parte cuando estén las credenciales:**
1. Actualizar en orders-service: `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`,
   `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET`, y `WOMPI_API_BASE_URL`
   (quitar `sandbox.` del dominio).
2. Actualizar la URL de webhook en el dashboard de Wompi apuntando al
   dominio real de producción, no al túnel de desarrollo.
3. Confirmar en vivo con una compra real de bajo monto que el flujo
   completo (checkout → webhook → boleto emitido) funciona en producción.
4. Confirmar con soporte de Wompi los fees de su API de Payouts antes de
   automatizar el pago a organizadores (TODOS.md #13) — mientras tanto la
   liquidación sigue siendo manual.

**Depende de:** Fase 3 (necesita una URL de producción estable antes de
poder configurar el webhook real).

---

## Fase 5 — Apps en las tiendas (iOS + Android)

**Costos y trámites (los paga/gestiona el usuario):**
1. **Apple Developer Program** — US$99/año. Mismo bloqueo ya conocido de
   notificaciones push (TODOS.md #14) — con esto resuelto, además de
   push, se puede reactivar `Runner.entitlements` (ya preparado en el
   repo) y generar certificados/perfiles de **distribución**.
2. **Google Play Developer** — US$25, pago único.
3. Ambas tiendas piden el link a la política de privacidad (Fase 1).

**Preparación técnica (mi parte):**
1. Ícono final, capturas de pantalla, descripción de la ficha.
2. Build de **release** firmado para distribución (no el modo debug/ad-hoc
   usado hasta ahora para instalar por cable).
3. Recomendado: pasar primero por **TestFlight** (iOS) y el canal de
   **pruebas internas** de Google Play antes de la publicación pública.
4. Proceso de revisión de cada tienda (Apple puede tardar días y
   rechazar; Google suele ser más rápido).

**Depende de:** Fase 1 (política de privacidad publicada) y Fase 4 (debe
apuntar al backend de producción, no a sandbox).
