/**
 * Hold atómico de un LOTE de butacas puntuales — todo o nada: si CUALQUIER
 * butaca del lote ya tiene un hold vivo, ninguna se marca (evita que dos
 * compradores terminen con holds parciales solapados de la misma silla).
 * A diferencia del semáforo por zona (reserve.lua.ts, que cuenta cupos),
 * acá cada butaca es su propia clave con TTL individual — no hace falta
 * limpieza perezosa (ZREMRANGEBYSCORE): una clave vencida simplemente deja
 * de existir, Redis la borra solo.
 *
 * KEYS = una clave `seat-hold:{seatId}` por cada butaca del lote, en el
 *        mismo orden que ARGV[6] (la lista de ids).
 * ARGV[1] = ttlMs
 * ARGV[2] = reservationId
 * ARGV[3] = zoneId
 * ARGV[4] = userId
 * ARGV[5] = expiresAt (epoch ms, guardado en el hash de la reserva)
 * ARGV[6..] = seatIds, mismo orden que KEYS (para guardarlos en el hash de
 *             la reserva — así `release` sabe qué claves borrar sin tener
 *             que reconstruir KEYS desde otro lado)
 *
 * Retorna 1 si el hold se creó, 0 si alguna butaca ya estaba tomada.
 */
export const RESERVE_SEATS_SCRIPT = `
local ttlMs = tonumber(ARGV[1])
local reservationId = ARGV[2]
local zoneId = ARGV[3]
local userId = ARGV[4]
local expiresAt = ARGV[5]

for i = 1, #KEYS do
  if redis.call('EXISTS', KEYS[i]) == 1 then
    return 0
  end
end

local seatIds = {}
for i = 6, #ARGV do
  table.insert(seatIds, ARGV[i])
end
local seatIdsCsv = table.concat(seatIds, ',')

for i = 1, #KEYS do
  redis.call('SET', KEYS[i], reservationId, 'PX', ttlMs)
end

local reservationKey = 'seat-reservation:' .. reservationId
redis.call('HSET', reservationKey, 'zoneId', zoneId, 'userId', userId, 'expiresAt', expiresAt, 'seatIds', seatIdsCsv)
redis.call('PEXPIRE', reservationKey, ttlMs)
return 1
`;
