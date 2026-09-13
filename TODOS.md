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

## 3. Comportamiento de access-service ante timeout de tickets-service durante escaneo en vivo

**What:** Definir qué hace access-service (y qué ve el staff en el dispositivo) si
la consulta síncrona a tickets-service falla o expira durante un escaneo de QR.

**Why:** Sin esto, el staff en la puerta de un evento real podría quedarse sin saber
si un boleto es válido — falla silenciosa en el peor momento posible (evento en vivo,
fila de gente esperando).

**Pros:** UX crítica para el caso de uso real de control de acceso.

**Cons:** Ninguno real — es una decisión de diseño necesaria, no opcional.

**Context:** Dos modos degradados típicos: (a) permitir el acceso con advertencia
visual + registrar para auditoría posterior, o (b) denegar por defecto hasta que la
conexión se restablezca. Es una decisión de producto (tolerancia a fraude vs.
tolerancia a fricción en la entrada), no solo técnica — decidir con el caso de uso
real en mente (ej. evento gratuito de bajo riesgo vs. concierto de alto valor).

**Depends on:** Paso 7 (access-service) del roadmap.

