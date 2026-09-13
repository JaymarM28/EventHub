# @event-hub/internal-auth

Guard/interceptor NestJS compartido para el patrón de confianza entre
servicios decidido en el eng review (Finding 3/9 de `DESIGN.md`):
`api-gateway` valida el JWT una sola vez; los servicios internos confían en
un header firmado en vez de revalidar el JWT cada uno.

## Uso en api-gateway (emisor)

```ts
import { signInternalContext } from '@event-hub/internal-auth';

const { payload, signature } = signInternalContext(
  { userId, email, roles, validatedAt: Date.now() },
  process.env.INTERNAL_AUTH_SECRET!,
);
// reenviar como headers x-internal-context / x-internal-signature
// al hacer proxy del request al microservicio correspondiente
```

## Uso en un microservicio interno (consumidor)

```ts
import { APP_GUARD, Reflector } from '@nestjs/core';
import { InternalAuthGuard, InternalUser, InternalUserContext } from '@event-hub/internal-auth';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) =>
        new InternalAuthGuard(process.env.INTERNAL_AUTH_SECRET!, reflector),
      inject: [Reflector],
    },
  ],
})
export class AppModule {}

@Controller('tickets')
export class TicketsController {
  @Get('me')
  getMyTickets(@InternalUser() user: InternalUserContext) {
    return this.ticketsService.findByUser(user.userId);
  }
}
```

`INTERNAL_AUTH_SECRET` debe ser idéntico en `api-gateway` y en todos los
servicios internos (ver `.env.example` en la raíz del monorepo).

## Autorización por rol

```ts
import { APP_GUARD, Reflector } from '@nestjs/core';
import { InternalAuthGuard, RolesGuard, Roles, Public } from '@event-hub/internal-auth';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) =>
        new InternalAuthGuard(process.env.INTERNAL_AUTH_SECRET!, reflector),
      inject: [Reflector],
    },
    { provide: APP_GUARD, useClass: RolesGuard }, // DESPUÉS de InternalAuthGuard
  ],
})
export class AppModule {}

@Controller('events')
export class EventsController {
  @Post()
  @Roles('ORGANIZER', 'SUPER_ADMIN')
  create(@Body() dto: CreateEventDto) { ... }

  @Get()
  @Public() // navegar eventos no requiere login
  findAll() { ... }
}
```
