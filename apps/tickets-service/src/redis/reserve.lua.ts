/**
 * Semáforo por zona implementado como sorted set: cada miembro es un
 * reservationId, el score es su expiresAt (epoch ms). Antes de contar,
 * limpia los expirados (ZREMRANGEBYSCORE) — autolimpieza perezosa, sin
 * necesitar keyspace notifications ni un proceso de barrido aparte.
 *
 * KEYS[1] = zone:{zoneId}:reservations (sorted set)
 * KEYS[2] = reservation:{reservationId} (hash, TTL individual)
 * ARGV[1] = now (epoch ms)
 * ARGV[2] = ttlMs
 * ARGV[3] = reservationId
 * ARGV[4] = maxAvailable (capacity - confirmados, calculado por el caller
 *           desde Postgres — ver nota de "soft hold" en reservations.service.ts)
 * ARGV[5] = zoneId (para guardar en el hash)
 * ARGV[6] = userId (para guardar en el hash)
 *
 * Retorna 1 si la reserva se creó, 0 si la zona está llena.
 */
export const RESERVE_SCRIPT = `
local zoneKey = KEYS[1]
local reservationKey = KEYS[2]
local now = tonumber(ARGV[1])
local ttlMs = tonumber(ARGV[2])
local reservationId = ARGV[3]
local maxAvailable = tonumber(ARGV[4])
local zoneId = ARGV[5]
local userId = ARGV[6]

redis.call('ZREMRANGEBYSCORE', zoneKey, '-inf', now)
local activeCount = redis.call('ZCARD', zoneKey)
if activeCount >= maxAvailable then
  return 0
end

local expiresAt = now + ttlMs
redis.call('ZADD', zoneKey, expiresAt, reservationId)
redis.call('HSET', reservationKey, 'zoneId', zoneId, 'userId', userId, 'expiresAt', expiresAt)
redis.call('PEXPIRE', reservationKey, ttlMs)
return 1
`;
