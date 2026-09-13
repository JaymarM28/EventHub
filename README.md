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

- RabbitMQ management UI: http://localhost:15672 (user/pass en `.env`)
- Postgres: `localhost:5432`, bases separadas `auth_db`, `events_db`,
  `tickets_db`, `orders_db` (ver `infra/postgres/init-multiple-databases.sh`)
- Redis: `localhost:6379`

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
