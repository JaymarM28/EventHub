#!/usr/bin/env bash
#
# Checkpoint end-to-end (paso 8 del roadmap, DESIGN.md): levanta los 7
# microservicios contra la infraestructura real (Postgres/RabbitMQ/Redis) y
# corre el flujo completo — registro, evento, compra, notificaciones,
# escaneo de acceso — verificando cada paso con asserts reales, no mocks.
#
# Uso:
#   ./scripts/e2e-check.sh            # build + levantar + probar + apagar
#   ./scripts/e2e-check.sh --no-build # usa los dist/ ya compilados (más rápido)
#   ./scripts/e2e-check.sh --keep-up  # no apaga los servicios al terminar
#
# Requiere: infraestructura ya levantada (`pnpm dev:infra` en la raíz),
# Node 22+, y que cada apps/<servicio>/.env exista (copiar de .env.example).

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATEWAY_URL="http://localhost:3010"
PG_HOST=localhost
PG_PORT=5434
PG_USER=eventhub
PG_PASS=eventhub

DO_BUILD=1
KEEP_UP=0
for arg in "$@"; do
  case "$arg" in
    --no-build) DO_BUILD=0 ;;
    --keep-up) KEEP_UP=1 ;;
  esac
done

# Servicio -> puerto, en orden de arranque (dependencias primero). Sin
# arrays asociativos a propósito — el /bin/bash de macOS es 3.2 (sin
# soporte para `declare -A`), así que se usa un case en su lugar.
SERVICES=(auth-service events-service tickets-service orders-service notifications-service access-service api-gateway)
port_for() {
  case "$1" in
    auth-service) echo 3001 ;;
    events-service) echo 3002 ;;
    tickets-service) echo 3003 ;;
    orders-service) echo 3004 ;;
    notifications-service) echo 3005 ;;
    access-service) echo 3006 ;;
    api-gateway) echo 3010 ;;
  esac
}

PASS=0
FAIL=0

log()  { echo -e "\033[1;34m[e2e]\033[0m $*"; }
ok()   { echo -e "  \033[1;32m✓\033[0m $*"; PASS=$((PASS+1)); }
bad()  { echo -e "  \033[1;31m✗\033[0m $*"; FAIL=$((FAIL+1)); }

cleanup() {
  if [ "$KEEP_UP" -eq 1 ]; then
    log "Servicios dejados corriendo (--keep-up)."
    return
  fi
  log "Apagando servicios..."
  # NUNCA matar por el PID inicial de `$!` — `pnpm exec dotenv -- node ...`
  # es una cadena de 2-3 procesos (pnpm -> dotenv-cli -> node), y `kill` en
  # el PID de arriba de la cadena NO mata a los hijos (visto en vivo: los 7
  # servicios quedaron corriendo huérfanos tras un primer intento con
  # `kill -9 "$pid"` sobre el PID capturado en `$!`). Matar por PUERTO es
  # robusto sin importar cuántas capas de proceso haya en el medio.
  for svc in "${SERVICES[@]}"; do
    svc_port=$(port_for "$svc")
    pids_on_port=$(lsof -ti ":$svc_port" 2>/dev/null || true)
    [ -n "$pids_on_port" ] && echo "$pids_on_port" | xargs -r kill -9 2>/dev/null || true
  done
}
trap cleanup EXIT

psql_q() {
  local db="$1"; shift
  PGPASSWORD="$PG_PASS" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$db" -tAc "$1"
}

## Simula lo que OrdersService.markPaid() haría al recibir un webhook real
## de Mercado Pago confirmando el pago — el webhook real NO puede probarse
## acá porque Mercado Pago no puede alcanzar esta máquina sin un túnel
## público (a diferencia de Stripe CLI, Mercado Pago no ofrece un forward
## local). Esto SÍ ejercita de verdad todo lo que pasa DESPUÉS del pago
## (emisión de boletos, notificaciones, control de acceso) usando el mismo
## outbox transaccional que usaría el webhook real.
simulate_payment_confirmed() {
  local order_id="$1"
  psql_q orders_db "
    WITH o AS (
      UPDATE orders SET status='PAID' WHERE id='$order_id'
      RETURNING id, \"userId\", \"zoneId\", \"reservationId\", quantity
    )
    INSERT INTO outbox_events (id, type, payload, \"createdAt\", attempts)
    SELECT gen_random_uuid()::text, 'order.paid',
      jsonb_build_object('orderId', o.id, 'userId', o.\"userId\", 'zoneId', o.\"zoneId\", 'reservationId', o.\"reservationId\", 'quantity', o.quantity),
      now(), 0
    FROM o;
  " >/dev/null
}

wait_for_port() {
  local port="$1" name="$2" tries=30
  while [ "$tries" -gt 0 ]; do
    if curl -s -o /dev/null "http://localhost:$port" 2>/dev/null; then
      return 0
    fi
    # curl a un puerto que rechaza conexión da exit != 0; uno que SÍ escucha
    # (aunque responda 404) da exit 0 en -s -o /dev/null salvo timeout.
    sleep 0.5
    tries=$((tries-1))
  done
  bad "$name no respondió en el puerto $port tras 15s"
  return 1
}

# --- Preflight ---
log "Verificando infraestructura (Postgres/RabbitMQ/Redis)..."
if ! docker ps --format '{{.Names}}' | grep -q event-hub-postgres; then
  echo "Infraestructura no está arriba. Corré 'pnpm dev:infra' en la raíz primero." >&2
  exit 1
fi
ok "Infraestructura arriba"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && nvm use 22 >/dev/null 2>&1

if [ "$DO_BUILD" -eq 1 ]; then
  log "Compilando los 7 servicios..."
  for svc in "${SERVICES[@]}"; do
    (cd "$ROOT_DIR/apps/$svc" && pnpm build >/tmp/e2e-build-$svc.log 2>&1) \
      && ok "build $svc" \
      || { bad "build $svc — ver /tmp/e2e-build-$svc.log"; exit 1; }
  done
fi

# --- Arranque ---
log "Levantando los 7 servicios..."
for svc in "${SERVICES[@]}"; do
  (cd "$ROOT_DIR/apps/$svc" && pnpm exec dotenv -e .env -- node dist/main.js) \
    >/tmp/e2e-run-$svc.log 2>&1 &
  disown
done

for svc in "${SERVICES[@]}"; do
  svc_port=$(port_for "$svc")
  wait_for_port "$svc_port" "$svc" && ok "$svc arriba (puerto $svc_port)"
done

if [ "$FAIL" -gt 0 ]; then
  log "Algún servicio no arrancó — abortando. Logs en /tmp/e2e-run-*.log"
  exit 1
fi

# --- Flujo funcional ---
EMAIL_SUFFIX=$(date +%s)
ORG_EMAIL="org-e2e-$EMAIL_SUFFIX@eventhub.dev"
BUYER_EMAIL="buyer-e2e-$EMAIL_SUFFIX@eventhub.dev"

log "Registro de organizador y comprador..."
curl -s -X POST "$GATEWAY_URL/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"$ORG_EMAIL\",\"password\":\"password123\",\"firstName\":\"Org\",\"lastName\":\"E2E\",\"birthDate\":\"1990-01-01\"}" >/dev/null
curl -s -X POST "$GATEWAY_URL/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"$BUYER_EMAIL\",\"password\":\"password123\",\"firstName\":\"Buyer\",\"lastName\":\"E2E\",\"birthDate\":\"1990-01-01\"}" >/dev/null

psql_q auth_db "UPDATE users SET roles = ARRAY['ORGANIZER']::\"Role\"[] WHERE email = '$ORG_EMAIL';" >/dev/null
[ $? -eq 0 ] && ok "organizador promovido" || bad "no se pudo promover organizador"

ORG_TOKEN=$(curl -s -X POST "$GATEWAY_URL/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$ORG_EMAIL\",\"password\":\"password123\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
[ -n "$ORG_TOKEN" ] && ok "login organizador" || { bad "login organizador falló"; exit 1; }

log "Creando evento (zona de capacidad 1 para forzar el límite, y otra de capacidad 5 para Fase A)..."
CREATE=$(curl -s -X POST "$GATEWAY_URL/events" -H "Content-Type: application/json" -H "Authorization: Bearer $ORG_TOKEN" \
  -d '{"title":"E2E Check","venue":"CI","city":"CI City","category":"OTRO","startsAt":"2027-06-01T20:00:00.000Z","zones":[{"name":"Unica","price":10,"capacity":1},{"name":"Multi","price":20,"capacity":5}]}')
ZONE_ID=$(echo "$CREATE" | python3 -c "import sys,json; print(json.load(sys.stdin)['zones'][0]['id'])" 2>/dev/null)
MULTI_ZONE_ID=$(echo "$CREATE" | python3 -c "import sys,json; print(json.load(sys.stdin)['zones'][1]['id'])" 2>/dev/null)
EVENT_ID=$(echo "$CREATE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
[ -n "$ZONE_ID" ] && ok "evento creado, zona $ZONE_ID" || { bad "creación de evento falló: $CREATE"; exit 1; }

sleep 2 # tiempo para que event.created se propague a tickets-service (zonas) y access-service (EventAccess del organizador)

log "GET /events público (sin token)..."
PUBLIC_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/events")
[ "$PUBLIC_CODE" = "200" ] && ok "listado público de eventos (200)" || bad "listado público dio $PUBLIC_CODE"

log "Fase C: filtros de búsqueda (ciudad, categoría, precio)..."
FILTER_HIT=$(curl -s "$GATEWAY_URL/events?city=CI%20City&category=OTRO&maxPrice=10" | python3 -c "import sys,json; print(any(e['id']=='$EVENT_ID' for e in json.load(sys.stdin)))")
[ "$FILTER_HIT" = "True" ] && ok "filtro que SÍ coincide encuentra el evento" || bad "filtro que debía coincidir no encontró el evento"
FILTER_MISS=$(curl -s "$GATEWAY_URL/events?city=Ciudad%20Inexistente" | python3 -c "import sys,json; print(any(e['id']=='$EVENT_ID' for e in json.load(sys.stdin)))")
[ "$FILTER_MISS" = "False" ] && ok "filtro que NO coincide excluye el evento" || bad "filtro que debía excluir sí encontró el evento"

BUYER_TOKEN=$(curl -s -X POST "$GATEWAY_URL/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$BUYER_EMAIL\",\"password\":\"password123\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# Fase D (#20): checkout ya NO paga sincrónicamente — reserva y crea una
# preferencia de Mercado Pago (Checkout Pro), devolviendo PENDING +
# checkoutUrl. Completar el pago de verdad requiere el navegador/WebView
# real (tarjeta de prueba) y que Mercado Pago pueda llegar a nuestro
# webhook, algo que este script no puede simular sin un túnel público —
# eso se prueba a mano en la app. Lo que SÍ se verifica acá es que el
# nuevo contrato (PENDING + checkoutUrl) funciona de punta a punta contra
# Mercado Pago real.
log "Checkout (Fase D: ahora crea una preferencia de Mercado Pago, no paga sincrónicamente)..."
ORDER=$(curl -s -w "\n%{http_code}" -X POST "$GATEWAY_URL/orders/checkout" -H "Content-Type: application/json" -H "Authorization: Bearer $BUYER_TOKEN" \
  -d "{\"zoneId\":\"$ZONE_ID\",\"quantity\":1}")
ORDER_CODE=$(echo "$ORDER" | tail -1)
ORDER_BODY=$(echo "$ORDER" | sed '$d')
ORDER_ID=$(echo "$ORDER_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
ORDER_STATUS=$(echo "$ORDER_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
CHECKOUT_URL=$(echo "$ORDER_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('checkoutUrl') or '')" 2>/dev/null)
if [ "$ORDER_CODE" = "201" ] && [ "$ORDER_STATUS" = "PENDING" ] && [ -n "$CHECKOUT_URL" ]; then
  ok "checkout crea la orden PENDING con checkoutUrl de Mercado Pago"
else
  bad "checkout falló ($ORDER_CODE, status=$ORDER_STATUS): $ORDER_BODY"
fi
simulate_payment_confirmed "$ORDER_ID"

log "GARANTÍA DURA: segundo comprador debe ser rechazado (zona agotada)..."
BUYER2_EMAIL="buyer2-e2e-$EMAIL_SUFFIX@eventhub.dev"
curl -s -X POST "$GATEWAY_URL/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"$BUYER2_EMAIL\",\"password\":\"password123\",\"firstName\":\"Buyer2\",\"lastName\":\"E2E\",\"birthDate\":\"1990-01-01\"}" >/dev/null
BUYER2_TOKEN=$(curl -s -X POST "$GATEWAY_URL/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$BUYER2_EMAIL\",\"password\":\"password123\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
REJECT_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$GATEWAY_URL/orders/checkout" -H "Content-Type: application/json" -H "Authorization: Bearer $BUYER2_TOKEN" \
  -d "{\"zoneId\":\"$ZONE_ID\",\"quantity\":1}")
[ "$REJECT_CODE" = "409" ] && ok "sobreventa bloqueada (409)" || bad "se esperaba 409, dio $REJECT_CODE"

log "Fase A: comprar varios boletos en una sola orden..."
BUYER3_EMAIL="buyer3-e2e-$EMAIL_SUFFIX@eventhub.dev"
curl -s -X POST "$GATEWAY_URL/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"$BUYER3_EMAIL\",\"password\":\"password123\",\"firstName\":\"Buyer3\",\"lastName\":\"E2E\",\"birthDate\":\"1990-01-01\"}" >/dev/null
BUYER3_TOKEN=$(curl -s -X POST "$GATEWAY_URL/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$BUYER3_EMAIL\",\"password\":\"password123\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
MULTI_ORDER=$(curl -s -X POST "$GATEWAY_URL/orders/checkout" -H "Content-Type: application/json" -H "Authorization: Bearer $BUYER3_TOKEN" \
  -d "{\"zoneId\":\"$MULTI_ZONE_ID\",\"quantity\":3}")
MULTI_ORDER_ID=$(echo "$MULTI_ORDER" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
MULTI_AMOUNT=$(echo "$MULTI_ORDER" | python3 -c "import sys,json; print(json.load(sys.stdin)['amount'])" 2>/dev/null)
[ "$MULTI_AMOUNT" = "60" ] && ok "monto de la orden = precio unitario × cantidad (20×3=60)" || bad "monto esperado 60, fue $MULTI_AMOUNT"
simulate_payment_confirmed "$MULTI_ORDER_ID"

sleep 3 # tiempo para el outbox + consumo de order.paid/ticket.issued (3 boletos)

MULTI_TICKET_COUNT=$(curl -s "$GATEWAY_URL/tickets/mine" -H "Authorization: Bearer $BUYER3_TOKEN" | python3 -c "
import sys, json
tickets = json.load(sys.stdin)
print(len([t for t in tickets if t['orderId'] == '$MULTI_ORDER_ID']))
")
[ "$MULTI_TICKET_COUNT" = "3" ] && ok "se emitieron los 3 boletos de la orden" || bad "se esperaban 3 boletos, se emitieron $MULTI_TICKET_COUNT"

sleep 3 # tiempo para el outbox + consumo de order.paid/ticket.issued

log "Verificando boleto emitido..."
TICKET=$(curl -s "$GATEWAY_URL/tickets/mine" -H "Authorization: Bearer $BUYER_TOKEN")
QR_TOKEN=$(echo "$TICKET" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['qrToken'] if d else '')" 2>/dev/null)
[ -n "$QR_TOKEN" ] && ok "boleto emitido con QR" || bad "no se encontró boleto: $TICKET"

log "Verificando notificaciones (pago + boleto)..."
NOTIF_COUNT=$(curl -s "$GATEWAY_URL/notifications/mine" -H "Authorization: Bearer $BUYER_TOKEN" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
[ "$NOTIF_COUNT" = "2" ] && ok "2 notificaciones recibidas" || bad "se esperaban 2 notificaciones, hubo $NOTIF_COUNT"

if [ -n "$QR_TOKEN" ]; then
  # El organizador escanea su PROPIO evento — TODOS.md #4: access-service
  # ya no deja escanear a cualquier autenticado, solo a quien esté
  # autorizado para ese evento (el organizador lo está automáticamente,
  # sincronizado vía event.created; ver EventAccessConsumer).
  log "Escaneo de acceso: primer escaneo debe ser VALID..."
  SCAN1=$(curl -s -X POST "$GATEWAY_URL/access/scan" -H "Content-Type: application/json" -H "Authorization: Bearer $ORG_TOKEN" \
    -d "{\"qrToken\":\"$QR_TOKEN\"}")
  echo "$SCAN1" | grep -q '"status":"VALID"' && ok "primer escaneo VALID" || bad "primer escaneo: $SCAN1"

  log "Escaneo de acceso: segundo escaneo debe ser ALREADY_USED..."
  SCAN2=$(curl -s -X POST "$GATEWAY_URL/access/scan" -H "Content-Type: application/json" -H "Authorization: Bearer $ORG_TOKEN" \
    -d "{\"qrToken\":\"$QR_TOKEN\"}")
  echo "$SCAN2" | grep -q '"status":"ALREADY_USED"' && ok "segundo escaneo ALREADY_USED" || bad "segundo escaneo: $SCAN2"

  log "Escaneo de acceso: un usuario SIN permiso para este evento debe ser FORBIDDEN..."
  SCAN3=$(curl -s -X POST "$GATEWAY_URL/access/scan" -H "Content-Type: application/json" -H "Authorization: Bearer $BUYER2_TOKEN" \
    -d "{\"qrToken\":\"$QR_TOKEN\"}")
  echo "$SCAN3" | grep -q '"status":"FORBIDDEN"' && ok "escaneo sin permiso -> FORBIDDEN" || bad "escaneo sin permiso: $SCAN3"
fi

log "Verificando que el endpoint interno de tickets NO esté expuesto por el gateway..."
INTERNAL_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$GATEWAY_URL/internal/tickets/x/validate" -H "Authorization: Bearer $BUYER_TOKEN")
[ "$INTERNAL_CODE" = "404" ] && ok "endpoint interno bloqueado (404)" || bad "endpoint interno respondió $INTERNAL_CODE (debería ser 404)"

# --- Limpieza de datos de prueba ---
for db in auth_db events_db tickets_db orders_db notifications_db access_db; do
  case "$db" in
    auth_db) psql_q "$db" "DELETE FROM refresh_tokens; DELETE FROM users WHERE email LIKE '%-e2e-$EMAIL_SUFFIX@%';" >/dev/null ;;
    events_db) psql_q "$db" "DELETE FROM zones WHERE id = '$ZONE_ID'; DELETE FROM events WHERE title = 'E2E Check';" >/dev/null ;;
    tickets_db) psql_q "$db" "DELETE FROM tickets WHERE \"zoneId\" IN ('$ZONE_ID', '$MULTI_ZONE_ID'); DELETE FROM event_zones WHERE id IN ('$ZONE_ID', '$MULTI_ZONE_ID');" >/dev/null ;;
    orders_db) psql_q "$db" "DELETE FROM orders WHERE \"zoneId\" IN ('$ZONE_ID', '$MULTI_ZONE_ID');" >/dev/null ;;
    access_db) psql_q "$db" "DELETE FROM event_access WHERE \"eventId\" = '$EVENT_ID';" >/dev/null ;;
    *) ;;
  esac
done

echo ""
log "Resultado: $PASS pasaron, $FAIL fallaron"
[ "$FAIL" -eq 0 ]
