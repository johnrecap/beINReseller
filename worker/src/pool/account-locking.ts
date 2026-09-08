/**
 * Account Locking Utilities
 * Prevents multiple workers from using the same account simultaneously
 */

import Redis from 'ioredis'

const LOCK_PREFIX = 'bein:account:lock:'
const EXECUTION_LEASE_PREFIX = 'bein:account:execution-lease:'
const FENCING_PREFIX = 'bein:account:fence:'
const DEFAULT_LOCK_TTL = 300 // 5 minutes (accounts for long operations)
const DEFAULT_STALE_LOCK_SECONDS = 300

export const ACCOUNT_EXECUTION_LEASE_TTL_SECONDS = 120
export const ACCOUNT_EXECUTION_LEASE_HEARTBEAT_SECONDS = 30

export interface AccountExecutionLeaseHandle {
  accountId: string
  operationId: string
  reservationGeneration: number
  leaseId: string
  fencingToken: number
  workerId: string
  acquiredAt: string
}

export interface AccountExecutionLeaseStatus {
  active: boolean
  owner: Omit<AccountExecutionLeaseHandle, 'accountId'> | null
  ttlSeconds: number
}

type RedisExecutionLeaseBoundary = Pick<Redis, 'eval' | 'get' | 'ttl'>

export function buildAccountExecutionLeaseKey(accountId: string): string {
  return `${EXECUTION_LEASE_PREFIX}${accountId}`
}

function buildAccountExecutionFenceKey(accountId: string): string {
  return `${FENCING_PREFIX}${accountId}`
}

export function buildAccountExecutionLeaseOwnerValue(
  handle: AccountExecutionLeaseHandle
): string {
  return JSON.stringify({
    operationId: handle.operationId,
    reservationGeneration: handle.reservationGeneration,
    leaseId: handle.leaseId,
    fencingToken: handle.fencingToken,
    workerId: handle.workerId,
    acquiredAt: handle.acquiredAt,
  })
}

export function parseAccountExecutionLeaseOwner(
  value: string | null
): Omit<AccountExecutionLeaseHandle, 'accountId'> | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (
      typeof parsed.operationId !== 'string' || !parsed.operationId ||
      typeof parsed.reservationGeneration !== 'number' ||
      !Number.isSafeInteger(parsed.reservationGeneration) ||
      parsed.reservationGeneration <= 0 ||
      typeof parsed.leaseId !== 'string' || !parsed.leaseId ||
      typeof parsed.fencingToken !== 'number' ||
      !Number.isSafeInteger(parsed.fencingToken) ||
      parsed.fencingToken <= 0 ||
      typeof parsed.workerId !== 'string' || !parsed.workerId ||
      typeof parsed.acquiredAt !== 'string' || !Number.isFinite(new Date(parsed.acquiredAt).getTime())
    ) {
      return null
    }

    return {
      operationId: parsed.operationId,
      reservationGeneration: parsed.reservationGeneration,
      leaseId: parsed.leaseId,
      fencingToken: parsed.fencingToken,
      workerId: parsed.workerId,
      acquiredAt: parsed.acquiredAt,
    }
  } catch {
    return null
  }
}

export function executionLeaseOwnerMatches(
  currentOwner: string | null,
  handle: AccountExecutionLeaseHandle
): boolean {
  const parsed = parseAccountExecutionLeaseOwner(currentOwner)
  return !!parsed &&
    parsed.operationId === handle.operationId &&
    parsed.reservationGeneration === handle.reservationGeneration &&
    parsed.leaseId === handle.leaseId &&
    parsed.fencingToken === handle.fencingToken &&
    parsed.workerId === handle.workerId &&
    parsed.acquiredAt === handle.acquiredAt
}

export async function acquireAccountExecutionLease(
  redis: RedisExecutionLeaseBoundary,
  input: Omit<AccountExecutionLeaseHandle, 'fencingToken' | 'acquiredAt'> & {
    ttlSeconds?: number
    acquiredAt?: string
  }
): Promise<AccountExecutionLeaseHandle | null> {
  const ttlSeconds = input.ttlSeconds ?? ACCOUNT_EXECUTION_LEASE_TTL_SECONDS
  if (
    !input.accountId.trim() ||
    !input.operationId.trim() ||
    !Number.isSafeInteger(input.reservationGeneration) ||
    input.reservationGeneration <= 0 ||
    !input.leaseId.trim() ||
    !input.workerId.trim() ||
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds <= 0
  ) {
    return null
  }

  const acquiredAt = input.acquiredAt ?? new Date().toISOString()
  if (!Number.isFinite(new Date(acquiredAt).getTime())) return null

  const templateHandle: AccountExecutionLeaseHandle = {
    accountId: input.accountId,
    operationId: input.operationId,
    reservationGeneration: input.reservationGeneration,
    leaseId: input.leaseId,
    fencingToken: 0,
    workerId: input.workerId,
    acquiredAt,
  }
  const template = buildAccountExecutionLeaseOwnerValue(templateHandle)
  const marker = '"fencingToken":0'
  const markerIndex = template.indexOf(marker)
  if (markerIndex < 0) return null
  const ownerPrefix = template.slice(0, markerIndex + '"fencingToken":'.length)
  const ownerSuffix = template.slice(markerIndex + marker.length)
  const script = `
    if redis.call("exists", KEYS[1]) == 1 then
      return nil
    end
    local token = redis.call("incr", KEYS[2])
    local owner = ARGV[1] .. tostring(token) .. ARGV[2]
    redis.call("set", KEYS[1], owner, "EX", ARGV[3])
    return { owner, tostring(token) }
  `
  const result = await redis.eval(
    script,
    2,
    buildAccountExecutionLeaseKey(input.accountId),
    buildAccountExecutionFenceKey(input.accountId),
    ownerPrefix,
    ownerSuffix,
    ttlSeconds
  ) as [string, string] | null

  if (!result) return null
  const fencingToken = Number(result[1])
  if (!Number.isSafeInteger(fencingToken) || fencingToken <= 0) return null

  return { ...templateHandle, fencingToken }
}

/**
 * Atomically converts the exact legacy lock observed by a caller into a
 * fenced execution lease. A duplicate invocation cannot delete or step over
 * another invocation's legacy owner between separate Redis commands.
 */
export async function transitionAccountLockToExecutionLease(
  redis: RedisExecutionLeaseBoundary,
  input: Omit<AccountExecutionLeaseHandle, 'fencingToken' | 'acquiredAt'> & {
    expectedLegacyOwner: string
    ttlSeconds?: number
    acquiredAt?: string
  }
): Promise<AccountExecutionLeaseHandle | null> {
  const ttlSeconds = input.ttlSeconds ?? ACCOUNT_EXECUTION_LEASE_TTL_SECONDS
  if (
    !input.expectedLegacyOwner ||
    !input.accountId.trim() ||
    !input.operationId.trim() ||
    !Number.isSafeInteger(input.reservationGeneration) ||
    input.reservationGeneration <= 0 ||
    !input.leaseId.trim() ||
    !input.workerId.trim() ||
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds <= 0
  ) {
    return null
  }

  const acquiredAt = input.acquiredAt ?? new Date().toISOString()
  if (!Number.isFinite(new Date(acquiredAt).getTime())) return null
  const templateHandle: AccountExecutionLeaseHandle = {
    accountId: input.accountId,
    operationId: input.operationId,
    reservationGeneration: input.reservationGeneration,
    leaseId: input.leaseId,
    fencingToken: 0,
    workerId: input.workerId,
    acquiredAt,
  }
  const template = buildAccountExecutionLeaseOwnerValue(templateHandle)
  const marker = '"fencingToken":0'
  const markerIndex = template.indexOf(marker)
  if (markerIndex < 0) return null
  const ownerPrefix = template.slice(0, markerIndex + '"fencingToken":'.length)
  const ownerSuffix = template.slice(markerIndex + marker.length)
  const script = `
    if redis.call("get", KEYS[1]) ~= ARGV[1] then
      return nil
    end
    if redis.call("exists", KEYS[2]) == 1 then
      return nil
    end
    local token = redis.call("incr", KEYS[3])
    local owner = ARGV[2] .. tostring(token) .. ARGV[3]
    redis.call("del", KEYS[1])
    redis.call("set", KEYS[2], owner, "EX", ARGV[4])
    return { owner, tostring(token) }
  `
  const result = await redis.eval(
    script,
    3,
    `${LOCK_PREFIX}${input.accountId}`,
    buildAccountExecutionLeaseKey(input.accountId),
    buildAccountExecutionFenceKey(input.accountId),
    input.expectedLegacyOwner,
    ownerPrefix,
    ownerSuffix,
    ttlSeconds
  ) as [string, string] | null

  if (!result) return null
  const fencingToken = Number(result[1])
  if (!Number.isSafeInteger(fencingToken) || fencingToken <= 0) return null
  return { ...templateHandle, fencingToken }
}

export async function assertAccountExecutionLease(
  redis: RedisExecutionLeaseBoundary,
  handle: AccountExecutionLeaseHandle
): Promise<boolean> {
  const current = await redis.get(buildAccountExecutionLeaseKey(handle.accountId))
  return executionLeaseOwnerMatches(current, handle)
}

export async function renewAccountExecutionLease(
  redis: RedisExecutionLeaseBoundary,
  handle: AccountExecutionLeaseHandle,
  ttlSeconds: number = ACCOUNT_EXECUTION_LEASE_TTL_SECONDS
): Promise<boolean> {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) return false

  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("expire", KEYS[1], ARGV[2])
    end
    return 0
  `
  const result = await redis.eval(
    script,
    1,
    buildAccountExecutionLeaseKey(handle.accountId),
    buildAccountExecutionLeaseOwnerValue(handle),
    ttlSeconds
  )
  return result === 1
}

export async function releaseAccountExecutionLease(
  redis: RedisExecutionLeaseBoundary,
  handle: AccountExecutionLeaseHandle
): Promise<boolean> {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    end
    return 0
  `
  const result = await redis.eval(
    script,
    1,
    buildAccountExecutionLeaseKey(handle.accountId),
    buildAccountExecutionLeaseOwnerValue(handle)
  )
  return result === 1
}

export async function getAccountExecutionLeaseStatus(
  redis: RedisExecutionLeaseBoundary,
  accountId: string
): Promise<AccountExecutionLeaseStatus> {
  const key = buildAccountExecutionLeaseKey(accountId)
  const [rawOwner, ttlSeconds] = await Promise.all([redis.get(key), redis.ttl(key)])
  const owner = parseAccountExecutionLeaseOwner(rawOwner)
  return {
    active: !!owner && ttlSeconds > 0,
    owner,
    ttlSeconds,
  }
}

export async function isAccountExecutionLeaseActive(
  redis: RedisExecutionLeaseBoundary,
  accountId: string
): Promise<boolean> {
  return (await getAccountExecutionLeaseStatus(redis, accountId)).active
}

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
  handoffReady: boolean
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
  if (isAccountLockHandoffReady(currentOwner)) return { allowed: false, reason: 'different_owner' }
  if (
    operationId &&
    parsed.operationId === operationId &&
    parsed.workerId === workerId
  ) {
    return { allowed: true, reason: 'same_operation' }
  }
  if (parsed.workerId === workerId && !parsed.operationId) {
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
  if (
    operationId &&
    parsed.operationId === operationId &&
    parsed.workerId === workerId
  ) {
    return { allowed: true, reason: 'same_operation' }
  }
  if (parsed.workerId === workerId && !parsed.operationId) {
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
    handoffReady: isAccountLockHandoffReady(currentOwner),
  }
}

function isAccountLockHandoffReady(value: string | null): boolean {
  try { return !!value && JSON.parse(value).handoffReady === true } catch { return false }
}

/** Park only our exact owner after the last HTTP/session write and before publishing
 * the next stage. Retain the TTL and exclusion until a continuation atomically
 * converts this marker to an execution lease; a running owner is never stolen. */
export async function parkAccountLockForHandoff(
  redis: RedisExecutionLeaseBoundary, accountId: string, workerId: string, operationId: string
): Promise<boolean> {
  const key = `${LOCK_PREFIX}${accountId}`
  const raw = await redis.get(key)
  const owner = parseAccountLockOwner(raw)
  if (!raw || owner.workerId !== workerId || owner.operationId !== operationId ||
      isAccountLockHandoffReady(raw)) return false
  const parked = JSON.stringify({ workerId, operationId, acquiredAt: owner.acquiredAt, handoffReady: true })
  const result = await redis.eval(`
    if redis.call("get", KEYS[1]) ~= ARGV[1] then return 0 end
    local ttl = redis.call("pttl", KEYS[1])
    if ttl <= 0 then return 0 end
    redis.call("set", KEYS[1], ARGV[2], "PX", ttl)
    return 1
  `, 1, key, raw, parked)
  return result === 1
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
  if (!decision.allowed || !currentOwner) return false

  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      redis.call("set", KEYS[1], ARGV[2], "EX", ARGV[3])
      return 1
    end
    return 0
  `
  const replaced = await redis.eval(
    script,
    1,
    key,
    currentOwner,
    ownerValue,
    ttlSeconds
  )
  return replaced === 1
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
