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

