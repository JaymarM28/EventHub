# TODOs

Captured during /plan-eng-review on 2026-09-12 (design doc: DESIGN.md).

## 1. Mitigar cuello de botella de lock contention en Redis para eventos populares

**What:** El mecanismo de reserva TTL en Redis (premisa 6) serializa todas las
reservas de una misma zona/evento en una sola clave. Bajo tráfico masivo (miles de
compradores simultáneos por la última unidad), esto se convierte en un cuello de
botella de latencia.

**Why:** Sistemas de ticketing reales (Ticketmaster-style) enfrentan exactamente
este problema en lanzamientos de alta demanda — confirmado en la búsqueda de
Landscape Findings del design doc.

**Pros:** Prepara el sistema para picos de venta reales si el proyecto evoluciona
a negocio real (premisa 1).

**Cons:** Sharding de locks o colas de espera añaden complejidad significativa —
no es necesario mientras el volumen de prueba sea bajo.

**Context:** Redis WATCH/MULTI (o Lua scripts atómicos) resuelven la concurrencia
correcta, pero no el throughput masivo contra un solo hot-key. Investigar sharding
por zona+franja horaria, o una cola de admisión (virtual waiting room) si esto se
vuelve relevante.

**Depends on:** Que el sistema core (pasos 1-9 del roadmap) ya funcione end-to-end.

---

## 2. Cache de listado de eventos (lectura intensiva)

**What:** Agregar cache (Redis o in-memory) al endpoint de listado/detalle de
eventos en `events-service`.

**Why:** Es previsible que las lecturas (browsear eventos) superen ampliamente
las escrituras (crear/editar eventos) — un patrón clásico read-heavy.

**Pros:** Reduce carga en Postgres, respuesta más rápida en la app Flutter.

**Cons:** La invalidación de cache tras `event.updated` añade una capa de
complejidad que hay que diseñar con cuidado (cache-aside vs. invalidación por
evento).

**Context:** No urgente mientras el catálogo de eventos de prueba sea pequeño.

**Depends on:** Que `events-service` (paso 4 del roadmap) ya exista.

---

## 3. ~~Comportamiento de access-service ante timeout de tickets-service~~ — RESUELTO (paso 7)

**Resuelto al implementar access-service:** ni "permitir con advertencia" ni
"denegar por defecto" — un tercer estado explícito `DEGRADED`, distinto de
`VALID`/`ALREADY_USED`/`INVALID`. Cada intento (incluidos los degradados) se
audita en `ScanLog` con quién escaneó y cuándo. La decisión de qué hacer
físicamente en la puerta ante un `DEGRADED` (dejar pasar con advertencia vs.
pedir verificación manual) queda para la UI de Flutter (paso 9) — el backend
ya no falla en silencio ni devuelve un 500 genérico, que era el riesgo real.

**Verificado en vivo:** con `tickets-service` apagado a mitad del flujo, el
escaneo devolvió `DEGRADED` con mensaje claro, y quedó registrado en
`scan_logs` igual que cualquier otro intento.

---

## 4. ~~Seguridad: rol STAFF no aplicado en access-service~~ — RESUELTO (2026-09-15)

**Resuelto:** el organizador da de alta STAFF **por evento** (no un rol
global) vía `POST /events/:id/staff` (ownership-checked: solo el dueño del
evento o SUPER_ADMIN). Ese endpoint crea la cuenta en `auth-service`
(`POST /internal/users`, nuevo, protegido por `InternalAuthGuard` +
`@Roles('ORGANIZER','SUPER_ADMIN')` como defensa en profundidad) con los
datos que el organizador define — incluida la contraseña, que le comunica
al staff por fuera de la app (decisión explícita: esta app no tiene envío
de emails real).

`events-service` guarda la relación en `EventStaff` y emite
`event.staff-assigned`; `access-service` (que antes era 100% HTTP, sin
consumidor RabbitMQ) ahora también consume `event.created` (autoriza
automáticamente al organizador para su propio evento) y ese evento nuevo,
manteniendo un read-model local `EventAccess {eventId, userId}` — mismo
patrón que la sync de zonas en tickets-service, para que el escaneo no
dependa en vivo de que `events-service` esté arriba.

**Bug real encontrado al diseñar esto:** `tickets-service` marcaba el
boleto como usado en el MISMO paso en que lo validaba — resolver el evento
del boleto DENTRO de esa llamada habría dejado "quemar" un boleto antes de
siquiera chequear el permiso. Se separó en dos endpoints internos: uno de
solo lectura (`GET /internal/tickets/:id`, nuevo) para resolver el
`eventId` ANTES de decidir autorización, y el `validate` original (que sí
consume) solo se llama después de confirmar el permiso.

`ScansService.scan()` ahora tiene un cuarto estado explícito `FORBIDDEN`
(auditado en `ScanLog` igual que los demás) para quien no está autorizado
para ese evento; `SUPER_ADMIN` salta el chequeo.

**Verificado:** organizador crea evento → agrega staff con
`POST /events/:id/staff` → comprador compra boleto → el staff recién
creado escanea y da `VALID` → un usuario sin relación con el evento
escanea el mismo boleto y da `FORBIDDEN`. `scripts/e2e-check.sh` (27/27)
incluye el caso FORBIDDEN.

---

## 5. `mobile_scanner` no compila para simulador de iOS en Apple Silicon

**What:** El paso 9c (escaneo de QR) depende de `mobile_scanner`, que a su
vez depende de Google MLKit. Los pods de MLKit no traen slice arm64 para
simulador — solo dispositivo real — así que compilar la app Flutter para
el simulador de iOS en un Mac Apple Silicon falla al linkear.

**Why:** Limitación conocida del ecosistema (MLKit + CocoaPods + Apple
Silicon), no un bug propio. Se intentó el workaround estándar
(`EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64` en Podfile y en
`Runner.xcodeproj` para forzar x86_64 vía Rosetta) pero seguía fallando el
link a `flutter_secure_storage` al momento de escribir esto — no se
investigó más a fondo para no bloquear el paso 9a (verificado en Android
emulator en su lugar, sin este problema).

**Pros:** Resolver esto permite testear TODO el flujo (incluido escaneo)
en simulador, más rápido de iterar que un dispositivo físico.

**Cons:** Es una guerra conocida de CocoaPods/Xcode — puede consumir horas
sin garantía de que el fix final sea limpio; puede que la respuesta
correcta sea simplemente "iOS: solo dispositivo real para 9c".

**Context:** Alternativas a evaluar: (a) terminar de depurar la exclusión
de arquitectura, (b) evaluar un paquete de escaneo de QR alternativo sin
dependencia de MLKit (ej. basado en ZXing puro) si el problema persiste.
**(b) — probar en un iPhone físico conectado — ya se hizo (paso 9c,
2026-09-15): el escaneo con cámara real funciona sin este problema
(VALID/ALREADY_USED confirmados en un iPhone 14 Pro Max)**, así que esto
queda limitado únicamente al simulador de iOS, no bloquea nada más.

**Depends on:** Paso 9c (escaneo de QR) del roadmap.


---

## 6. ~~Calidad de código: Prettier + ESLint compartido entre los 10 packages~~ — PARCIALMENTE RESUELTO (2026-10-17)

**What:** Cada servicio quedó con el estilo/lint que trajo su scaffold de
NestJS (reglas básicas del CLI, sin Prettier configurado a nivel de
monorepo). No hay formato consistente entre los 10 packages ni reglas de
lint más allá de lo mínimo.

**Why:** Se decidió explícitamente posponerlo (2026-09-16) al arrancar la
profesionalización del proyecto — se priorizó primero CI/CD, Dockerizar
los 7 servicios, y documentación de API (OpenAPI/Swagger).

**Context:** Cuando se retome: un `.prettierrc` + `eslint.config.js` en la
raíz del workspace, extendido (no reemplazado) por cada servicio si
necesita reglas propias. Considerar agregarlo como paso del pipeline de
CI/CD una vez que exista (TODOS.md — profesionalización 2026-09-16), para
que el formato se valide automáticamente en cada push.

**Resuelto:** `eslint.nest-base.mjs` (raíz) + `eslint.config.mjs` por
servicio en los 7 servicios NestJS, corriendo en `.github/workflows/ci.yml`
junto con typecheck y tests. `.prettierrc` instalado en la raíz, pero
**sin conectarlo a eslint** (`eslint-plugin-prettier`) — el código existente
nunca pasó por ese formatter, y wirearlo ahora mismo habría generado miles
de errores de formato en vez de bugs reales.

**Pendiente:** correr `prettier --write` sobre los 7 servicios en una pasada
dedicada (commit grande, solo formato) y recién ahí activar
`eslint-plugin-prettier`. `web` (eslint) y `admin-panel` (oxlint) ya tenían
lint propio desde antes — no tocados.

**Depends on:** Nada bloqueante — se puede hacer en cualquier momento.

---

## 7. Túnel permanente para el webhook/redirect de Wompi

**What:** En desarrollo local, `API_PUBLIC_URL` (orders-service) apunta a un
túnel de Cloudflare efímero (`cloudflared tunnel --url ...`) — muere cada
vez que se reinicia el proceso, y hay que actualizar la URL a mano tanto en
`.env` como en el dashboard de Wompi ("Eventos").

**Why:** Ya causó una falla real en producción de pruebas (2026-09-28): un
pago aprobado por Wompi nunca emitió el boleto porque el webhook apuntaba a
un túnel muerto — se detectó y corrigió a mano, pero es el único punto que
puede perder una venta real sin que nadie se entere hasta que un comprador
se queje.

**Pros:** Elimina por completo esta clase de falla silenciosa; deja de
depender de que alguien recuerde actualizar el dashboard de Wompi.

**Cons:** Requiere un dominio propio + certificado (o un plan pago de
Cloudflare Tunnel con hostname fijo) — no es gratis ni instantáneo como el
quick tunnel actual.

**Context:** Alternativas: (a) Cloudflare Tunnel con hostname fijo sobre un
dominio propio, (b) desplegar orders-service (o al menos el endpoint de
webhook) en un host con IP/dominio estable desde el día uno.

**Depends on:** Tener un dominio para el proyecto (jmalphatech.com u otro).

---

## 8. ~~Notificaciones push (recordatorio, confirmación, reembolso)~~ — RESUELTO (2026-09-30, ver #14)

**What:** Hoy toda comunicación con el comprador pasa por email
(notifications-service). No hay push nativo para recordatorio antes del
evento, confirmación de compra, ni aviso de reembolso.

**Why:** El email tiene peor tasa de apertura que push, y un recordatorio
justo antes del evento es donde más valor aporta (reduce no-shows).

**Pros:** Mejora retención y experiencia sin tocar el modelo de datos —
notifications-service ya sabe QUÉ avisar, solo faltaría el canal.

**Cons:** Requiere integrar FCM/APNs, gestionar tokens de dispositivo por
usuario, y manejar el caso de notificaciones denegadas por el usuario.

**Context:** Empezar por los tres eventos que ya se publican y consumen
(`order.paid`, `order.refunded`, y un job nuevo de recordatorio N horas
antes de `event.startsAt`).

**Depends on:** Nada bloqueante.

---

## 9. Boleto disponible sin internet (QR cacheado localmente)

**What:** `TicketScreen` pide el boleto en vivo — si el comprador llega a
la puerta sin señal, no puede mostrar el QR aunque ya lo haya comprado y
visto antes.

**Why:** La puerta de un evento (estadio, arena) es exactamente donde peor
señal hay — es el peor momento posible para depender de la red.

**Pros:** El punto de falla más crítico del flujo completo (comprar →
entrar) deja de depender de conectividad en el momento exacto que más
importa.

**Cons:** Cachear el QR localmente hay que hacerlo con cuidado de no
mostrar un boleto ya reembolsado/usado como si siguiera válido — el caché
es solo para MOSTRAR el código, `access-service` sigue siendo la única
fuente de verdad al escanear.

**Context:** Guardar el `qrToken` ya visto (ej. `shared_preferences` o
`flutter_secure_storage`, ya en el proyecto) la primera vez que
`MyTicketsScreen`/`TicketScreen` lo cargan exitosamente.

**Depends on:** Nada bloqueante.

---

## 10. Compartir evento (share nativo)

**What:** No hay forma de compartir el link de un evento fuera de la app —
la única difusión posible es que alguien ya tenga la app instalada.

**Why:** La mayoría de la difusión real de un evento (WhatsApp, redes)
pasa por reenviar un link, no por la app misma.

**Pros:** Cambio chico (un botón + `share_plus` o similar) con impacto
directo en alcance/ventas.

**Cons:** Requiere que exista un link web público al que pueda entrar
alguien SIN la app instalada (hoy `event_detail_screen` es solo mobile) —
si no hay landing web, el link no sirve de mucho.

**Context:** Depende de decidir si existe (o se construye) una versión web
mínima de "ver evento" antes de que compartir tenga sentido real.

**Depends on:** Una URL pública para eventos (landing web o deep link con
fallback a la store).

---

## 11. ~~Lista de espera cuando una zona se agota~~ — RESUELTO (2026-10-01)

**Resuelto:** `WaitlistEntry` en tickets-service (`join`/`leave`/`status`
en `GET/POST/DELETE /tickets/zones/:zoneId/waitlist`) — cualquier usuario
autenticado puede anotarse, pero SOLO si la zona está realmente agotada
(rechaza con 400 si todavía hay cupo). Cuando un reembolso libera cupo
(`TicketsService.refundByOrder`), se avisa en orden FIFO a los primeros
`N` sin avisar todavía (`WaitlistService.notifyFreedSlots`), uno por
`waitlist.slot-available` publicado — notifications-service lo consume y
manda email + push ("¡Se liberó un cupo!"). Sin "hold" exclusivo para
nadie en esta v1 (decisión de simplicidad): el aviso solo le da ventaja de
tiempo, no una reserva garantizada.

**Mobile:** cuando el checkout falla con "Zona agotada", el botón
"Reintentar" del sheet de compra se reemplaza por "Unirme a la lista de
espera".

**Bug real encontrado y arreglado al construir esto:** un reembolso NUNCA
liberaba cupo de verdad — `ReservationsService.reserve` y
`TicketsService.confirmZoneCapacity` contaban TODOS los boletos de la zona
(`ticket.count({ where: { zoneId } })`), incluidos los reembolsados. Una
zona con una sola orden reembolsada quedaba "agotada" para siempre, aunque
el cupo ya estuviera libre. Se agregó `refundedAt: null` a ambos conteos
(con tests de regresión, `GARANTÍA #11`). **Pendiente, fuera de alcance de
este cambio:** el mismo problema existe para butacas puntuales (Fase 2) —
el `@unique` de `Ticket.seatId` no tiene en cuenta `refundedAt`, así que
una butaca reembolsada queda bloqueada para siempre y nunca se puede
revender. No se tocó porque redefinir esa garantía dura (hoy sin lock
manual, solo el índice único) merece su propio análisis, no un fix de
pasada.

**Depends on:** Nada bloqueante — no necesitó push real (#14) para
funcionar, el email ya alcanza como canal.

---

## 12. `API_HOST` hardcodeado por `--dart-define` en vez de config de entorno

**What:** La IP del backend viaja como `--dart-define=API_HOST=...` al
compilar — si la IP de la máquina de desarrollo cambia (cambio de red,
reinicio de router), la app instalada queda apuntando a una IP muerta
hasta reinstalar.

**Why:** Pasó en vivo en esta sesión (2026-09-28): la Mac cambió de
`192.168.78.111` a `10.10.65.165` y la app dejó de cargar eventos sin
ningún error visible para el usuario — solo se resolvió reinstalando con
la IP nueva.

**Pros:** Un endpoint configurable (o un dominio estable en vez de IP LAN)
elimina esta clase de falla por completo, y ya seria necesario de todas
formas para un build de producción real (no se puede shippear una IP LAN
a una tienda de apps).

**Cons:** Ninguno real — es puramente deuda de "modo desarrollo rápido",
no una decisión de diseño a defender.

**Context:** Para producción esto se resuelve solo (un dominio real, no una
IP LAN) — el problema es específico de development contra un backend local.

**Depends on:** Nada bloqueante.

---

## 13. ~~Modelo de negocio: cargo por servicio al comprador + payout a organizadores vía Wompi~~ — RESUELTO (2026-10-17, salvo automatizar el payout real)

**What:** Hoy `OrdersService.checkout()` cobra exactamente
`zona.precio × cantidad − descuento` a través de UNA sola cuenta de Wompi
(las llaves en `.env` de orders-service) — el 100% de cada venta de
CUALQUIER organizador cae ahí, sin comisión de plataforma ni forma de
devolverle su parte al organizador. Decisiones tomadas con el usuario
(2026-09-28):

1. **Quién paga la comisión:** el comprador, como "Cargo por servicio"
   visible y separado en el checkout — el organizador sigue recibiendo el
   100% del precio que él publicó.
2. **Monto:** porcentaje fijo, propuesto **10%** por defecto — vive como
   valor configurable (env o tabla de config), nunca hardcodeado en el
   cálculo, para poder ajustarlo sin deploy de código.
3. **Payout a organizadores:** investigado en vivo — Wompi tiene una API
   real de **"Pagos a Terceros" / Payouts** (`POST /payouts`, ver
   https://docs.wompi.co/en/docs/colombia/introduccion-pagos-a-terceros/),
   NO es split automático estilo Stripe Connect, pero sí permite disparar
   transferencias programáticas a la cuenta bancaria o billetera
   (Nequi/Daviplata) de un beneficiario, individual o por lotes, sin un
   proceso de onboarding/KYC complejo documentado (los datos del
   beneficiario — cédula, nombre, cuenta bancaria — se mandan en el mismo
   request de pago, no se registran antes). Fees y límites exactos de
   Wompi para esto NO están en la documentación pública — hay que
   confirmarlos con su equipo comercial antes de comprometerse a un
   modelo de precios propio.

**Why:** Sin esto, la plataforma no genera ingreso Y además acumula una
obligación hacia los organizadores que hoy no tiene cómo saldar — no es
solo "falta monetizar", es un riesgo real si esto procesa dinero de
terceros en serio.

**Pros:** El comprador ve el mismo modelo que Eventbrite/Ticketmaster
(cargo por servicio transparente); el organizador nunca ve reducido el
precio que publicó, lo cual facilita la conversación comercial con ellos.
Wompi Payouts evita construir una integración bancaria propia desde cero.

**Cons:** Wompi Payouts liquida DESPUÉS de cobrar (no es split en el mismo
momento del pago) — hay que decidir cuándo pagarle al organizador
(inmediato por orden vs. por lotes periódicos) considerando el riesgo de
reembolsos: pagarle de inmediato y que la orden se reembolse después deja
a la plataforma cubriendo esa plata de su propio bolsillo. Lo más seguro
es liquidar por lotes (ej. semanal, o N días después del evento) reteniendo
un colchón contra reembolsos tardíos — igual que el "rolling reserve" que
usan las pasarelas de pago reales.

**Context — cambios concretos que esto implica:**
- `orders-service`: sumar `serviceFee` al total cobrado en `checkout()`
  (nuevo campo en `Order`, ej. `serviceFeeAmount`), y NUNCA descontarlo del
  monto que se le acredita al organizador.
- Nuevo modelo `OrganizerPayoutAccount` (tipo/número de cuenta, banco,
  cédula) — el organizador lo carga una vez en el admin panel.
- Nuevo proceso de liquidación (job periódico o botón manual "Liquidar" en
  el admin panel) que suma las órdenes PAID no liquidadas de un
  organizador, descuenta reembolsos, y dispara `POST /payouts` por el
  neto.
- Confirmar con Wompi (soporte comercial, no la doc pública): fees de la
  API de Payouts, límites diarios reales para el volumen esperado, y si
  hace falta un contrato/plan distinto al de cobro normal.

**Depends on:** Contactar al soporte/ventas de Wompi para confirmar fees y
requisitos de Payouts antes de comprometerse a una fecha de lanzamiento
de esta pieza — es la única incógnita real que no se resuelve solo
programando.

**Resuelto:** Todo lo de arriba está implementado y probado (37/37 tests de
`orders-service` pasan, incluido `payouts.service.spec.ts`) —
`serviceFeeAmount` en `Order` (configurable vía `SERVICE_FEE_RATE`, 10% por
defecto), `OrganizerPayoutAccount`, `PayoutsService.pendingSummary`/`settle`,
`PayoutsController` con roles correctos, y `PayoutsPage.tsx` en el admin
panel (sidebar + ruta ya conectados). El reembolso devuelve el monto
completo (incluye el cargo por servicio) y las órdenes reembolsadas quedan
excluidas de liquidación automáticamente (status ya no es `PAID`).

**Resuelto (2026-10-17):** colchón de `PAYOUT_HOLD_DAYS` (5 días por
defecto, configurable) — una orden `PAID` recién cuenta para
`pendingSummary`/`settle` después de ese tiempo desde que se pagó, el
mismo "rolling reserve" que mencionaba el punto "Cons" de más arriba.
Antes de esto, liquidar el mismo día que se cobró dejaba a la plataforma
cubriendo de su bolsillo cualquier reembolso que llegara después.

**Resuelto (2026-10-17):** panel de ingresos de la plataforma —
`PayoutsService.platformRevenue()` (total histórico + últimos 30 días del
cargo de servicio cobrado en órdenes `PAID`, sin importar si ya se
liquidaron al organizador o no) y su sección en `PayoutsPage.tsx`, visible
solo para `SUPER_ADMIN`.

**Pendiente real:** la liquidación sigue siendo MANUAL (un `SUPER_ADMIN`
aprieta "Liquidar" en el admin panel) — no dispara ninguna transferencia
real todavía. Automatizarla contra `POST /payouts` de Wompi sigue
dependiendo de la conversación comercial con Wompi (fees/límites no están
en la doc pública).

---

## 14. Notificaciones push — Android listo, iOS bloqueado por cuenta de Apple

**What:** El código de notificaciones push (2026-09-29) ya está construido
end-to-end y probado:

- `events-service`: cron cada hora (`EventRemindersService`) que detecta
  eventos a 23-25h de empezar y publica `event.reminder-due`.
- `notifications-service`: `PushService` (Firebase Cloud Messaging),
  modelo `DeviceToken`, endpoints `POST/DELETE /notifications/device-tokens`,
  y push agregado a los 4 casos: confirmación de pago, boleto listo,
  **reembolso** (nuevo) y **recordatorio antes del evento** (nuevo).
- Mobile: `PushNotificationsService` — pide permiso, registra/da de baja
  el token de FCM según la sesión (login/logout).

Progreso real (2026-09-30): se creó el proyecto de Firebase
(`event-hub-3a522`) y se agregaron las apps iOS/Android con bundle id
`dev.eventhub.mobile`.

- **Android: 100% configurado.** `google-services.json` colocado en
  `android/app/`, plugin `com.google.gms.google-services` agregado en
  `settings.gradle.kts`/`app/build.gradle.kts`. Solo falta el paso 2 de
  abajo (cuenta de servicio) para que el backend pueda enviar.
- **iOS: bloqueado por un límite real de Apple, no de configuración.**
  `GoogleService-Info.plist` ya está colocado y wireado en el proyecto de
  Xcode (`project.pbxproj`), pero al intentar activar la capability de
  Push Notifications (`Runner.entitlements` con `aps-environment`), Xcode
  rechazó la build en el dispositivo real con:
  > Cannot create a iOS App Development provisioning profile for
  > "dev.eventhub.mobile". Personal development teams... do not support
  > the Push Notifications capability.

  La cuenta de Apple del usuario es un **"Personal Team"** (Apple ID
  gratis) — Apple directamente NO PERMITE push notifications sin una
  membresía paga de **Apple Developer Program (US$99/año,
  developer.apple.com/programs)**. Se revirtió el cambio de capability
  (`CODE_SIGN_ENTITLEMENTS` sacado de las 3 configuraciones de build) para
  que la app siga instalando normal en el iPhone mientras tanto —
  `Runner.entitlements` quedó creado en el repo pero sin referenciar, listo
  para reactivar con un solo cambio.

**Pasos que faltan:**
1. **(Bloqueante para iOS)** Pagar la membresía de Apple Developer
   Program y, en Xcode, cambiar el Team de "Personal Team" al nuevo team
   pago en Signing & Capabilities — recién ahí reactivar
   `CODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements;` en las 3
   configuraciones (Debug/Release/Profile) de `project.pbxproj`.
2. En Apple Developer (ya con cuenta paga): generar una APNs Auth Key
   (Certificates, IDs & Profiles > Keys) y subirla en Firebase (Project
   Settings > Cloud Messaging > Configuración de app de Apple).
3. Generar una cuenta de servicio de Firebase (Project Settings > Cuentas
   de servicio > Generar nueva clave privada) y completar
   `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` en
   `notifications-service/.env` — esto YA se puede hacer, no depende de
   la cuenta paga de Apple (habilita push en Android de una).

**Why:** Apple exige la membresía paga para cualquier app que use APNs,
sin excepción — no es algo que se pueda sortear con configuración ni con
una cuenta de desarrollador gratuita.

**Pros:** Android ya está listo end-to-end salvo la cuenta de servicio
(paso 3, sin costo). El trabajo de iOS no se perdió — queda a un solo
cambio de reactivarse apenas haya cuenta paga.

**Cons:** US$99/año es un costo real que no existía en el plan original.

**Context:** Ver el comentario completo con los pasos de Firebase/Apple en
`apps/mobile/lib/core/push_notifications_service.dart`.

**Depends on:** Que el usuario decida pagar Apple Developer Program antes
de que push funcione en iOS. Android no depende de esto.

---

## 15. Una butaca reembolsada (Fase 2) no se puede volver a vender

**What:** Al construir la lista de espera (#11) se encontró y arregló un
bug: un reembolso no liberaba cupo real porque los conteos de capacidad
contaban boletos reembolsados como vendidos. Se arregló para zonas "por
cupo" (`refundedAt: null` agregado a los conteos), pero el mismo problema
sigue sin resolver para zonas con **butacas puntuales** (Fase 2): el
`@unique` de `Ticket.seatId` (schema.prisma, tickets-service) es la
garantía dura contra doble venta de una butaca — pero no distingue boletos
reembolsados, así que una butaca reembolsada sigue "ocupando" ese
`seatId` único para siempre. Nadie puede volver a comprarla jamás,
aunque el comprador original haya sido reembolsado.

**Why:** No se tocó al resolver #11 porque es una garantía dura (hoy sin
lock manual, solo el índice único de Postgres) — cambiarla a la ligera
arriesga reintroducir la doble venta que esa misma garantía previene.
Merece su propio diseño, no un fix de pasada.

**Pros:** Sin esto, cualquier evento con mapa de butacas pierde cupo real
permanentemente cada vez que alguien se reembolsa — un problema que crece
con el tiempo.

**Cons:** La solución no es trivial. Opciones a evaluar:
- Poner `seatId = null` al reembolsar (libera el `@unique`, pero pierde el
  historial de "qué butaca tenía este ticket").
- Cambiar a un índice único PARCIAL (`WHERE "refundedAt" IS NULL`) — Prisma
  no lo expresa en el schema DSL directamente, requeriría SQL crudo en la
  migración.
- Volver a validar "sold" (`reserveSeats`/`confirmSeats`/`seatsForZone`)
  filtrando `refundedAt: null` en vez de depender solo del índice único
  para el chequeo previo — el índice seguiría siendo la garantía DURA
  final, pero necesitaría la variante de índice parcial de todas formas
  para no chocar al insertar el ticket nuevo.

**Context:** Afecta `ReservationsService.reserveSeats` (chequeo "sold"),
`TicketsService.confirmSeats` (constraint `@unique`), y
`TicketsService.seatsForZone` (mapa de disponibilidad que ve el comprador)
— los tres necesitan el mismo criterio para ser consistentes entre sí.

**Depends on:** Nada bloqueante — ningún evento real del usuario usa
butacas puntuales con reembolsos todavía, así que no es urgente.

---

## 16. Monitoreo de errores en producción (Sentry o similar)

**What:** Hoy no hay forma de enterarse de una excepción no controlada en
producción (por ejemplo, en el flujo de pago de `orders-service` o en la
confirmación de boletos de `tickets-service`) hasta que un usuario se
queja. No hay captura automática de errores, stack traces ni alertas.

**Why:** Parte de la Fase 3 del `DEPLOYMENT_PLAN.md` (monitoreo/CI-CD).
Explícitamente pospuesto (2026-10-17) para priorizar primero el CI/CD +
lint backend (TODOS.md #6).

**Context:** `@sentry/nestjs` en los servicios críticos como mínimo
(`orders-service`, `tickets-service`, `auth-service`, `api-gateway`) — DSN
vía variable de entorno, init en cada `main.ts`. Plan gratuito de Sentry
alcanza para este tamaño de proyecto.

**Depends on:** Nada bloqueante — se puede hacer en cualquier momento, pero
cobra más urgencia una vez que Wompi pase de sandbox a producción (Fase 4
del `DEPLOYMENT_PLAN.md`), porque ahí empieza a haber dinero real en juego.
