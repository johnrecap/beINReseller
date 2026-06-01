/**
 * Account Locking Utilities
 * Prevents multiple workers from using the same account simultaneously
 */

import Redis from 'ioredis'

const LOCK_PREFIX = 'bein:account:lock:'
const DEFAULT_LOCK_TTL = 300 // 5 minutes (accounts for long operations)
const DEFAULT_STALE_LOCK_SECONDS = 300

export interface AccountLockOwner {
  raw: string | null
  workerId: string | null
  operationId: string | null
  acquiredAt: string | null
  legacy: boolean
}

export interface AccountLockDecision {
  allowed: boolean
  reason: 'no_lock' | 'same_operation' | 'same_worker' | 'different_owner'
}

export interface AccountLockStatus {
  locked: boolean
  stale: boolean
  rawOwner: string | null
  ownerWorkerId: string | null
  ownerOperationId: string | null
  acquiredAt: string | null
  ageSeconds: number | null
  ttlSeconds: number | null
  legacy: boolean
}

export function buildAccountLockOwnerValue(input: {
  workerId: string
  operationId?: string | null
  acquiredAt?: Date
}): string {
  if (!input.operationId) return input.workerId

  return JSON.stringify({
    workerId: input.workerId,
    operationId: input.operationId,
    acquiredAt: (input.acquiredAt ?? new Date()).toISOString(),
  })
}

export function parseAccountLockOwner(value: string | null): AccountLockOwner {
  if (!value) {
    return {
      raw: null,
      workerId: null,
      operationId: null,
      acquiredAt: null,
      legacy: false,
    }
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return {
      raw: value,
      workerId: typeof parsed.workerId === 'string' ? parsed.workerId : null,
      operationId: typeof parsed.operationId === 'string' ? parsed.operationId : null,
      acquiredAt: typeof parsed.acquiredAt === 'string' ? parsed.acquiredAt : null,
      legacy: false,
    }
  } catch {
    return {
      raw: value,
      workerId: value,
      operationId: null,
      acquiredAt: null,
      legacy: true,
    }
  }
}

export function canAcquireAccountLock(
  currentOwner: string | null,
  workerId: string,
  operationId?: string | null
): AccountLockDecision {
  const parsed = parseAccountLockOwner(currentOwner)

  if (!currentOwner) return { allowed: true, reason: 'no_lock' }
  if (operationId && parsed.operationId === operationId) {
    return { allowed: true, reason: 'same_operation' }
  }
  if (parsed.workerId === workerId && (!parsed.operationId || !operationId)) {
    return { allowed: true, reason: 'same_worker' }
  }

  return { allowed: false, reason: 'different_owner' }
}

export function canReleaseAccountLock(
  currentOwner: string | null,
  workerId: string,
  operationId?: string | null
): AccountLockDecision {
  const parsed = parseAccountLockOwner(currentOwner)

  if (!currentOwner) return { allowed: false, reason: 'no_lock' }
  if (operationId && parsed.operationId === operationId) {
    return { allowed: true, reason: 'same_operation' }
  }
  if (parsed.workerId === workerId) {
    return { allowed: true, reason: 'same_worker' }
  }

  return { allowed: false, reason: 'different_owner' }
}

export function getAccountLockStatusFromOwner(
  currentOwner: string | null,
  options: { now?: Date; ttlSeconds?: number | null; staleAfterSeconds?: number } = {}
): AccountLockStatus {
  const parsed = parseAccountLockOwner(currentOwner)
  const now = options.now ?? new Date()
  const acquiredAtTime = parsed.acquiredAt ? new Date(parsed.acquiredAt).getTime() : NaN
  const ageSeconds = Number.isFinite(acquiredAtTime)
    ? Math.max(0, Math.floor((now.getTime() - acquiredAtTime) / 1000))
    : null
  const locked = !!currentOwner
  const staleAfterSeconds = options.staleAfterSeconds ?? DEFAULT_STALE_LOCK_SECONDS

  return {
    locked,
    stale: locked && ageSeconds !== null && ageSeconds >= staleAfterSeconds,
    rawOwner: currentOwner,
    ownerWorkerId: parsed.workerId,
    ownerOperationId: parsed.operationId,
    acquiredAt: parsed.acquiredAt,
    ageSeconds,
    ttlSeconds: options.ttlSeconds ?? null,
    legacy: parsed.legacy,
  }
}

/**
 * Acquire a lock on an account
 * Uses Redis SET NX for atomic locking
 */
export async function lockAccount(
  redis: Redis,
  accountId: string,
  workerId: string,
  ttlSeconds: number = DEFAULT_LOCK_TTL,
  operationId?: string | null
): Promise<boolean> {
  const key = `${LOCK_PREFIX}${accountId}`
  const ownerValue = buildAccountLockOwnerValue({ workerId, operationId })
  const result = await redis.set(key, ownerValue, 'EX', ttlSeconds, 'NX')
  if (result === 'OK') return true

  const currentOwner = await redis.get(key)
  const decision = canAcquireAccountLock(currentOwner, workerId, operationId)
  if (!decision.allowed) return false

  await redis.set(key, ownerValue, 'EX', ttlSeconds)
  return true
}

/**
 * Release a lock on an account
 * Only releases if the lock is owned by the specified worker
 */
export async function unlockAccount(
  redis: Redis,
  accountId: string,
  workerId: string,
  operationId?: string | null
): Promise<boolean> {
  const key = `${LOCK_PREFIX}${accountId}`
  const currentOwner = await redis.get(key)
  const decision = canReleaseAccountLock(currentOwner, workerId, operationId)
  if (!decision.allowed || !currentOwner) return false

  // Lua script to atomically check and delete
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `

  const result = await redis.eval(script, 1, key, currentOwner)
  return result === 1
}

/**
 * Force release a lock (admin use only)
 */
export async function forceUnlockAccount(
  redis: Redis,
  accountId: string
): Promise<void> {
  const key = `${LOCK_PREFIX}${accountId}`
  await redis.del(key)
}

/**
 * Check if an account is locked
 */
export async function isAccountLocked(
  redis: Redis,
  accountId: string
): Promise<boolean> {
  const key = `${LOCK_PREFIX}${accountId}`
  const exists = await redis.exists(key)
  return exists === 1
}

/**
 * Get the worker ID that holds the lock
 */
export async function getLockOwner(
  redis: Redis,
  accountId: string
): Promise<string | null> {
  const key = `${LOCK_PREFIX}${accountId}`
  return await redis.get(key)
}

export async function getAccountLockStatus(
  redis: Redis,
  accountId: string,
  options: { now?: Date; staleAfterSeconds?: number } = {}
): Promise<AccountLockStatus> {
  const key = `${LOCK_PREFIX}${accountId}`
  const [currentOwner, ttlSeconds] = await Promise.all([
    redis.get(key),
    redis.ttl(key).catch(() => null),
  ])

  return getAccountLockStatusFromOwner(currentOwner, {
    now: options.now,
    ttlSeconds,
    staleAfterSeconds: options.staleAfterSeconds,
  })
}

/**
 * Extend the lock TTL (keep-alive)
 */
export async function extendLock(
  redis: Redis,
  accountId: string,
  workerId: string,
  ttlSeconds: number = DEFAULT_LOCK_TTL,
  operationId?: string | null
): Promise<boolean> {
  const key = `${LOCK_PREFIX}${accountId}`
  const currentOwner = await redis.get(key)
  const decision = canReleaseAccountLock(currentOwner, workerId, operationId)
  if (!decision.allowed || !currentOwner) return false

  // Lua script to atomically check ownership and extend TTL
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("expire", KEYS[1], ARGV[2])
    else
      return 0
    end
  `

  const result = await redis.eval(script, 1, key, currentOwner, ttlSeconds)
  return result === 1
}
