import { createHash } from "node:crypto"

export const MAX_LOGIN_FAILURES = 3
export const LOGIN_COOLDOWN_SECONDS = 120
export const LOGIN_ATTEMPT_WINDOW_SECONDS = 120

export type LoginFailureReason =
    | "unknown_login"
    | "wrong_password"
    | "disabled_account"
    | "missing_password_hash"
    | "cooldown_active"
    | "missing_input"
    | "unexpected_error"

export type LoginAttemptInput = {
    loginName: string
    ip?: string | null
    userAgent?: string | null
}

type StoredLoginAttemptWindow = {
    exactLoginName: string
    contextFingerprint: string
    failedCount: number
    firstFailedAt: number
    lastFailedAt: number
    cooldownUntil: number | null
    lastReasonCategory: LoginFailureReason
}

export type LoginAttemptResult =
    | {
        status: "allowed"
        remainingAttempts: number
        failedCount: number
        cooldownSeconds: 0
        canRetry: true
    }
    | {
        status: "failed"
        remainingAttempts: number
        failedCount: number
        cooldownSeconds: 0
        canRetry: true
    }
    | {
        status: "cooldown_active"
        remainingAttempts: 0
        failedCount: number
        cooldownSeconds: number
        canRetry: false
        cooldownUntil: number
    }

export type LoginAttemptStore = {
    recordFailure(key: string, seed: StoredLoginAttemptWindow, now: number): Promise<StoredLoginAttemptWindow>
    get(key: string): Promise<StoredLoginAttemptWindow | null>
    set(key: string, value: StoredLoginAttemptWindow, ttlSeconds: number): Promise<void>
    delete(key: string): Promise<void>
}

type LoginAttemptOptions = {
    store?: LoginAttemptStore
    now?: () => number
}

export class InMemoryLoginAttemptStore implements LoginAttemptStore {
    private readonly records = new Map<string, { value: StoredLoginAttemptWindow; expiresAt: number }>()

    constructor(private readonly now: () => number = () => Date.now()) { }

    async recordFailure(key: string, seed: StoredLoginAttemptWindow, now: number): Promise<StoredLoginAttemptWindow> {
        const record = this.records.get(key)
        const previous = record && record.expiresAt > now ? record.value : null
        if (previous?.cooldownUntil && previous.cooldownUntil > now) return previous
        const value = { ...seed, failedCount: Math.min(MAX_LOGIN_FAILURES, (previous?.failedCount ?? 0) + 1),
            firstFailedAt: previous?.firstFailedAt ?? now }
        value.cooldownUntil = value.failedCount >= MAX_LOGIN_FAILURES ? now + LOGIN_COOLDOWN_SECONDS * 1000 : null
        this.records.set(key, { value, expiresAt: value.cooldownUntil ?? now + LOGIN_ATTEMPT_WINDOW_SECONDS * 1000 })
        return value
    }

    async get(key: string): Promise<StoredLoginAttemptWindow | null> {
        const record = this.records.get(key)
        if (!record) {
            return null
        }

        if (record.expiresAt <= this.now()) {
            this.records.delete(key)
            return null
        }

        return record.value
    }

    async set(key: string, value: StoredLoginAttemptWindow, ttlSeconds: number): Promise<void> {
        this.records.set(key, {
            value,
            expiresAt: this.now() + ttlSeconds * 1_000,
        })
    }

    async delete(key: string): Promise<void> {
        this.records.delete(key)
    }
}

class RedisLoginAttemptStore implements LoginAttemptStore {
    async recordFailure(key: string, seed: StoredLoginAttemptWindow, now: number): Promise<StoredLoginAttemptWindow> {
        const { redis } = await import("@/lib/redis")
        const raw = await redis.eval(LOGIN_FAILURE_SCRIPT, 1, key, JSON.stringify(seed), now,
            MAX_LOGIN_FAILURES, LOGIN_COOLDOWN_SECONDS, LOGIN_ATTEMPT_WINDOW_SECONDS)
        return JSON.parse(String(raw)) as StoredLoginAttemptWindow
    }
    async get(key: string): Promise<StoredLoginAttemptWindow | null> {
        const { redis } = await import("@/lib/redis")
        const raw = await redis.get(key)
        if (!raw) {
            return null
        }

        return JSON.parse(raw) as StoredLoginAttemptWindow
    }

    async set(key: string, value: StoredLoginAttemptWindow, ttlSeconds: number): Promise<void> {
        const { redis } = await import("@/lib/redis")
        await redis.set(key, JSON.stringify(value), "EX", Math.max(1, ttlSeconds))
    }

    async delete(key: string): Promise<void> {
        const { redis } = await import("@/lib/redis")
        await redis.del(key)
    }
}

// GET/modify/SET and expiry happen as one Redis operation across all web processes.
export const LOGIN_FAILURE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
local next = cjson.decode(ARGV[1])
local now = tonumber(ARGV[2])
if raw then
    local previous = cjson.decode(raw)
    if previous.cooldownUntil ~= cjson.null and previous.cooldownUntil > now then return raw end
    if previous.cooldownUntil == cjson.null then
        next.failedCount = previous.failedCount
        next.firstFailedAt = previous.firstFailedAt
    end
end
next.failedCount = math.min(tonumber(ARGV[3]), next.failedCount + 1)
local ttl = tonumber(ARGV[5])
if next.failedCount >= tonumber(ARGV[3]) then
    ttl = tonumber(ARGV[4])
    next.cooldownUntil = now + ttl * 1000
end
local encoded = cjson.encode(next)
redis.call('SET', KEYS[1], encoded, 'EX', ttl)
return encoded
`

const fallbackStore = new InMemoryLoginAttemptStore()
const redisStore = new RedisLoginAttemptStore()

export function normalizeSubmittedLoginName(loginName: unknown): string {
    return String(loginName ?? "").trim()
}

export function buildLoginContextFingerprint(input: Omit<LoginAttemptInput, "loginName">): string {
    return createHash("sha256")
        .update(`${input.ip || "unknown-ip"}\n${input.userAgent || "unknown-agent"}`)
        .digest("hex")
        .slice(0, 32)
}

export function buildLoginAttemptKey(input: LoginAttemptInput): string {
    const exactLoginName = normalizeSubmittedLoginName(input.loginName)
    const contextFingerprint = buildLoginContextFingerprint(input)
    const digest = createHash("sha256")
        .update(`${exactLoginName}\n${contextFingerprint}`)
        .digest("hex")

    return `login-attempt:${digest}`
}

export function getLoginAttemptContextFromRequest(request: Request | null | undefined): Pick<LoginAttemptInput, "ip" | "userAgent"> {
    const headers = request?.headers
    const forwardedFor = headers?.get("x-forwarded-for")?.split(",")[0]?.trim()

    return {
        ip: headers?.get("cf-connecting-ip") || headers?.get("x-real-ip") || forwardedFor || "unknown-ip",
        userAgent: headers?.get("user-agent") || "unknown-agent",
    }
}

async function getActiveStore(options: LoginAttemptOptions | undefined): Promise<LoginAttemptStore> {
    return options?.store || redisStore
}

async function readWindow(
    key: string,
    options: LoginAttemptOptions | undefined
): Promise<{ store: LoginAttemptStore; value: StoredLoginAttemptWindow | null }> {
    const store = await getActiveStore(options)
    try {
        return { store, value: await store.get(key) }
    } catch (error) {
        if (options?.store) {
            throw error
        }
        return { store: fallbackStore, value: await fallbackStore.get(key) }
    }
}

async function deleteWindow(
    store: LoginAttemptStore,
    key: string,
    options: LoginAttemptOptions | undefined
): Promise<void> {
    try {
        await store.delete(key)
    } catch (error) {
        if (options?.store) {
            throw error
        }
        await fallbackStore.delete(key)
    }
}

function getCooldownSeconds(cooldownUntil: number, now: number): number {
    return Math.max(0, Math.ceil((cooldownUntil - now) / 1_000))
}

function toStatus(value: StoredLoginAttemptWindow | null, now: number): LoginAttemptResult {
    if (!value) {
        return {
            status: "allowed",
            remainingAttempts: MAX_LOGIN_FAILURES,
            failedCount: 0,
            cooldownSeconds: 0,
            canRetry: true,
        }
    }

    if (value.cooldownUntil && value.cooldownUntil > now) {
        return {
            status: "cooldown_active",
            remainingAttempts: 0,
            failedCount: value.failedCount,
            cooldownSeconds: getCooldownSeconds(value.cooldownUntil, now),
            canRetry: false,
            cooldownUntil: value.cooldownUntil,
        }
    }

    return {
        status: "failed",
        remainingAttempts: Math.max(0, MAX_LOGIN_FAILURES - value.failedCount),
        failedCount: value.failedCount,
        cooldownSeconds: 0,
        canRetry: true,
    }
}

export async function getLoginAttemptStatus(
    input: LoginAttemptInput,
    options?: LoginAttemptOptions
): Promise<LoginAttemptResult> {
    const now = options?.now?.() ?? Date.now()
    const key = buildLoginAttemptKey(input)
    const { value } = await readWindow(key, options)

    if (value?.cooldownUntil && value.cooldownUntil <= now) {
        return toStatus(null, now)
    }

    return toStatus(value, now)
}

export async function recordFailedLoginAttempt(
    input: LoginAttemptInput,
    reasonCategory: LoginFailureReason,
    options?: LoginAttemptOptions
): Promise<LoginAttemptResult> {
    const now = options?.now?.() ?? Date.now()
    const exactLoginName = normalizeSubmittedLoginName(input.loginName)
    const key = buildLoginAttemptKey(input)
    const seed: StoredLoginAttemptWindow = {
        exactLoginName, contextFingerprint: buildLoginContextFingerprint(input),
        failedCount: 0, firstFailedAt: now, lastFailedAt: now,
        cooldownUntil: null, lastReasonCategory: reasonCategory,
    }
    let nextWindow: StoredLoginAttemptWindow
    try {
        nextWindow = await (await getActiveStore(options)).recordFailure(key, seed, now)
    } catch (error) {
        if (options?.store) throw error
        nextWindow = await fallbackStore.recordFailure(key, seed, now)
    }

    return toStatus(nextWindow, now)
}

export async function clearLoginAttemptWindow(
    input: LoginAttemptInput,
    options?: Pick<LoginAttemptOptions, "store">
): Promise<void> {
    const key = buildLoginAttemptKey(input)
    const store = await getActiveStore(options)
    await deleteWindow(store, key, options)
    if (!options?.store) await fallbackStore.delete(key)
}
