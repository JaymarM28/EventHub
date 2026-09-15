# Event Hub — Microservicios

Plataforma de boletería para eventos, reconstruida como microservicios reales
(proyecto de aprendizaje con potencial de convertirse en negocio real).

- **Arquitectura y roadmap:** [`DESIGN.md`](./DESIGN.md)
- **Sistema de diseño (Flutter):** [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md)
- **Pendientes conocidos:** [`TODOS.md`](./TODOS.md)

## Stack

- **Backend de negocio:** NestJS (TypeScript) — auth, events, tickets,
  orders/payments, notifications, access-control.
- **IA (fase stretch):** Python/FastAPI.
- **Mobile:** Flutter.
- **Mensajería:** RabbitMQ vía `@nestjs/microservices` (`Transport.RMQ`).
- **Datos:** Postgres (una base por servicio), Redis (reservas TTL de
  boletos).
- **Orquestación local:** Docker Compose.

## Levantar la infraestructura

```bash
cp .env.example .env   # ajustar secretos si hace falta
pnpm dev:infra          # levanta Postgres, RabbitMQ, Redis
pnpm dev:infra:logs     # ver logs
pnpm dev:infra:down     # apagar
```

- RabbitMQ management UI: http://localhost:15674 (user/pass en `.env`)
- Postgres: `localhost:5434`, bases separadas `auth_db`, `events_db`,
  `tickets_db`, `orders_db`, `notifications_db`, `access_db` (ver
  `infra/postgres/init-multiple-databases.sh`)
- Redis: `localhost:6381`

> Puertos no estándar (5434/5674/15674/6381 en vez de 5432/5672/15672/6379):
> esta máquina ya tenía otros proyectos ocupando los puertos por defecto —
> ver Finding en el eng review. Ajustable por `.env` si tu entorno es distinto.

## Levantar los servicios

Cada servicio tiene su propio `.env` (copiar desde `.env.example` dentro de
cada `apps/<servicio>/`). Con la infraestructura arriba:

```bash
# Terminal 1 — auth-service (puerto 3001)
cd apps/auth-service
pnpm prisma:migrate   # solo la primera vez / tras cambios al schema
pnpm start:dev

# Terminal 2 — events-service (puerto 3002)
cd apps/events-service
pnpm prisma:migrate
pnpm start:dev

# Terminal 3 — tickets-service (puerto 3003, HTTP + consumidor RMQ)
cd apps/tickets-service
pnpm prisma:migrate
pnpm start:dev

# Terminal 4 — orders-service (puerto 3004, checkout + poller del outbox)
cd apps/orders-service
pnpm prisma:migrate
pnpm start:dev

# Terminal 5 — notifications-service (puerto 3005, HTTP + consumidor RMQ)
cd apps/notifications-service
pnpm prisma:migrate
pnpm start:dev

# Terminal 6 — access-service (puerto 3006, validación de QR)
cd apps/access-service
pnpm prisma:migrate
pnpm start:dev

# Terminal 7 — api-gateway (puerto 3010, único servicio pensado para exponerse)
cd apps/api-gateway
pnpm start:dev
```

## Checkpoint end-to-end (paso 8)

En vez de levantar y probar cada servicio a mano, `scripts/e2e-check.sh`
compila los 7 servicios, los levanta contra la infraestructura real, corre
el flujo completo (registro → evento → compra → sobreventa bloqueada →
notificaciones → escaneo de acceso → verificación de seguridad del
gateway), y limpia los datos de prueba al terminar — sin importar si pasó
o falló.

```bash
pnpm dev:infra              # la infra debe estar arriba primero
./scripts/e2e-check.sh              # build + levantar + probar + apagar
./scripts/e2e-check.sh --no-build   # reusa los dist/ ya compilados (más rápido)
./scripts/e2e-check.sh --keep-up    # no apaga los servicios al terminar
```

Probar el flujo de auth a través del gateway:

```bash
curl -X POST http://localhost:3010/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"tu@email.dev","password":"password123"}'
```

`JWT_SECRET` e `INTERNAL_AUTH_SECRET` deben ser idénticos entre
`auth-service`, `api-gateway` y todos los servicios internos — ver los
comentarios en cada `.env.example`. `TICKET_QR_SECRET` debe ser idéntico
entre `tickets-service` y (a futuro) `access-service`.

## App Flutter (`apps/mobile`)

```bash
cd apps/mobile
flutter pub get
flutter run -d <device-id>   # flutter devices para listar
flutter test
```

- Usa `dio` (interceptor: adjunta JWT, refresca una vez ante 401),
  `go_router` (redirect consciente de sesión), `flutter_secure_storage`
  (tokens en Keychain/Keystore, nunca en texto plano) y `provider`.
- El emulador de Android no resuelve `localhost` como el host — la app usa
  `10.0.2.2` automáticamente ahí (ver `lib/core/config.dart`); el
  simulador de iOS sí comparte red con el host. Un **dispositivo físico**
  (Android o iOS) no comparte red de ninguna forma — pásale la IP de LAN
  del Mac explícitamente:
  `flutter run -d <device-id> --dart-define=API_HOST=192.168.1.23`. El
  Mac y el teléfono deben estar en la misma red wifi.
- **Checkout (paso 9b):** tocar una zona abre un bottom sheet de confirmación
  (`showCheckoutSheet`); `POST /orders/checkout` solo confirma el pago — la
  emisión del boleto es asíncrona (outbox → RabbitMQ → tickets-service), así
  que el sheet hace polling corto a `GET /tickets/mine` hasta que el boleto
  del pedido aparece (no hay `GET /tickets/:id`). El boleto se muestra con su
  QR (`qr_flutter`, dibuja el `qrToken` firmado tal cual lo entrega el
  backend) en una pantalla que se cierra con swipe hacia abajo usando
  `SpringSimulation` real (velocity handoff + proyección de momentum, ver
  DESIGN_SYSTEM.md §2-6) — no un `Curves` fijo.
- **Escaneo de acceso (paso 9c):** ícono de QR en el AppBar de `/events`
  visible solo si el JWT trae rol `STAFF` u `ORGANIZER`
  (`AuthState.canScan`, decodificado del claim `roles` — no hay endpoint
  `/auth/me`). `app_router.dart` también bloquea `/scan` por redirect si
  alguien llega ahí sin el rol. **Esto es solo un bloqueo del lado del
  cliente** — `access-service` todavía no exige el rol en el backend (ver
  TODOS.md #4), así que no reemplaza autorización real. `POST /access/scan`
  devuelve un estado explícito por resultado (`VALID`/`ALREADY_USED`/
  `INVALID`/`DEGRADED`, este último para cuando tickets-service no responde,
  TODOS.md #3) — la pantalla vibra y colorea el visor en el mismo frame que
  detecta un código, sin esperar la respuesta de red. **Verificado con
  cámara real en un iPhone físico**: detecta el QR, marca `VALID` la
  primera vez y `ALREADY_USED` al reescanear el mismo boleto.

**Limitación conocida: `mobile_scanner` (QR, paso 9c) no compila para el
simulador de iOS en Mac Apple Silicon.** Los pods de Google MLKit no traen
slice arm64 para simulador, solo para dispositivo real — un problema
conocido del ecosistema, no un bug de esta app. Mitigado parcialmente con
`EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64` en el `Podfile` y en
`Runner.xcodeproj` (fuerza x86_64 vía Rosetta), pero seguía fallando el
link al momento de escribir esto — **probar la app completa en Android
emulator o en un iPhone/Android físico** (ambos confirmados funcionando);
iOS simulator solo sirve para pantallas que no toquen `mobile_scanner` una
vez este ajuste esté resuelto del todo.

## Gotchas del monorepo

**Cada schema.prisma DEBE declarar su propio `output`.** pnpm dedupea
`@prisma/client` a una sola ubicación física por versión resuelta — sin un
`output` propio por servicio, el último `prisma generate` que corras (de
CUALQUIER servicio) sobrescribe el cliente generado de los demás, y los
otros servicios truenan en runtime con `Cannot read properties of
undefined (reading 'findUnique')`. Ya configurado en `auth-service`,
`events-service`, `tickets-service` y `orders-service`
(`output = "../generated/prisma-client"`) — replicar en cada servicio
nuevo que use Prisma.

**`ConfigService.get<T>()` no convierte tipos en runtime.** Un valor de
`.env` siempre llega como string — pedir `get<number>('X', 10)` no lo
parsea, solo miente a TypeScript sobre el tipo. Vimos esto romper en vivo
(`Prisma` rechazando un filtro `lt` con un string). Parsear siempre con
`Number(...)` explícito.

**Errores 4xx/5xx entre servicios no se traducen solos.** Una llamada
síncrona vía `@nestjs/axios` que recibe un 409 del servicio destino llega
como `AxiosError` crudo — el exception filter de Nest lo convierte en 500
si no se traduce explícitamente a `HttpException` con el status/mensaje
originales (ver `tickets-client.service.ts`).

**El proyecto NO debe vivir dentro de una carpeta sincronizada por iCloud
Drive ("Escritorio y Documentos") si vas a compilar la app Flutter para un
iPhone físico.** iCloud vuelve a etiquetar `Flutter.framework/Flutter` con
el atributo extendido `com.apple.provenance` casi inmediatamente después
de que `flutter_tools` lo borra (es una carrera, ver
`removeExtendedAttributes` en `flutter_tools/lib/src/ios/mac.dart`), y
`codesign` falla con `"resource fork, Finder information, or similar
detritus not allowed"` — el build a simulador/Android no se ve afectado,
solo el de dispositivo físico (que sí requiere firma real). Visto en vivo:
el error desaparece por completo con el proyecto fuera de `~/Documents`
(ej. `~/Developer/`). Si ya te pasó, un `xattr -d com.apple.provenance
<archivo>` puntual no sirve porque vuelve a aparecer en el siguiente
build.

## Estructura

```
apps/           cada microservicio (NestJS/FastAPI) y la app Flutter
packages/
  internal-auth/  guard compartido: api-gateway valida JWT, servicios
                  internos confían en el header firmado (ver su README)
  shared-types/   contrato de eventos, colas/DLQ, outbox pattern
infra/
  postgres/       script de inicialización multi-base
```

## Roadmap

Ver el detalle completo en `DESIGN.md` — resumen de los primeros pasos:

1. Fundaciones (este commit): monorepo, Docker Compose, contratos compartidos.
2. auth-service + `packages/internal-auth`.
3. api-gateway.
4. events-service (primer consumidor de eventos real).
5. tickets-service + orders/payments-service (unidad, por la reserva síncrona).
6. notifications-service.
7. access-service.
8. Checkpoint end-to-end con curl/Postman.
9. Flutter app: 9a ✅ auth/eventos, 9b ✅ checkout + boleto con QR (ambos
   probados en Android emulator contra el backend real). 9c escaneo QR —
   pendiente.

Fase opcional/stretch: admin panel web, ai-service, Kubernetes, reembolsos.
