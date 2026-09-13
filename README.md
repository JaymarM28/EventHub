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
  `tickets_db`, `orders_db` (ver `infra/postgres/init-multiple-databases.sh`)
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

# Terminal 3 — api-gateway (puerto 3010, único servicio pensado para exponerse)
cd apps/api-gateway
pnpm start:dev
```

Probar el flujo de auth a través del gateway:

```bash
curl -X POST http://localhost:3010/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"tu@email.dev","password":"password123"}'
```

`JWT_SECRET` e `INTERNAL_AUTH_SECRET` deben ser idénticos entre
`auth-service` y `api-gateway` (y, a futuro, todos los servicios internos)
— ver los comentarios en cada `.env.example`.

## Gotchas del monorepo

**Cada schema.prisma DEBE declarar su propio `output`.** pnpm dedupea
`@prisma/client` a una sola ubicación física por versión resuelta — sin un
`output` propio por servicio, el último `prisma generate` que corras (de
CUALQUIER servicio) sobrescribe el cliente generado de los demás, y los
otros servicios truenan en runtime con `Cannot read properties of
undefined (reading 'findUnique')`. Ya configurado en `auth-service` y
`events-service` (`output = "../generated/prisma-client"`) — replicar en
cada servicio nuevo que use Prisma.

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
9. Flutter app (9a auth/eventos, 9b checkout, 9c escaneo QR).

Fase opcional/stretch: admin panel web, ai-service, Kubernetes, reembolsos.
