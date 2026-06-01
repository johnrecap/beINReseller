export const PACKAGE_SELECTION_TIMEOUT_SECONDS = 30
export const CONFIRMATION_TIMEOUT_SECONDS = 10
export const HEARTBEAT_STALE_SECONDS = 5
export const HEARTBEAT_INTERVAL_MS = 2000
export const OPERATION_WARNING_THRESHOLD_SECONDS = 3
export const HEARTBEAT_REDIS_TTL_SECONDS = HEARTBEAT_STALE_SECONDS + 5

export function buildOperationDeadline(now: Date, seconds: number): Date {
    return new Date(now.getTime() + seconds * 1000)
}

export function isDeadlineExpired(deadline: Date | string | null | undefined, now: Date = new Date()): boolean {
    if (!deadline) return false
    const deadlineTime = deadline instanceof Date ? deadline.getTime() : new Date(deadline).getTime()
    return Number.isFinite(deadlineTime) && now.getTime() > deadlineTime
}
