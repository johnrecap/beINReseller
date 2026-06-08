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

async function writeWindow(
    store: LoginAttemptStore,
    key: string,
    value: StoredLoginAttemptWindow,
    ttlSeconds: number,
    options: LoginAttemptOptions | undefined
): Promise<LoginAttemptStore> {
    try {
        await store.set(key, value, ttlSeconds)
        return store
    } catch (error) {
        if (options?.store) {
            throw error
        }
        await fallbackStore.set(key, value, ttlSeconds)
        return fallbackStore
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
    const { store, value } = await readWindow(key, options)

    if (value?.cooldownUntil && value.cooldownUntil <= now) {
        await deleteWindow(store, key, options)
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
    const { store, value } = await readWindow(key, options)
    const currentStatus = toStatus(value, now)

    if (currentStatus.status === "cooldown_active") {
        return currentStatus
    }

    const failedCount = Math.min(MAX_LOGIN_FAILURES, (value?.failedCount ?? 0) + 1)
    const cooldownUntil = failedCount >= MAX_LOGIN_FAILURES
        ? now + LOGIN_COOLDOWN_SECONDS * 1_000
        : null
    const nextWindow: StoredLoginAttemptWindow = {
        exactLoginName,
        contextFingerprint: buildLoginContextFingerprint(input),
        failedCount,
        firstFailedAt: value?.firstFailedAt ?? now,
        lastFailedAt: now,
        cooldownUntil,
        lastReasonCategory: reasonCategory,
    }

    const ttlSeconds = cooldownUntil
        ? LOGIN_COOLDOWN_SECONDS
        : LOGIN_ATTEMPT_WINDOW_SECONDS

    await writeWindow(store, key, nextWindow, ttlSeconds, options)

    return toStatus(nextWindow, now)
}

export async function clearLoginAttemptWindow(
    input: LoginAttemptInput,
    options?: Pick<LoginAttemptOptions, "store">
): Promise<void> {
    const key = buildLoginAttemptKey(input)
    const store = await getActiveStore(options)
    await deleteWindow(store, key, options)
}
