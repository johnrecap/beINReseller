export const BEIN_LOGIN_FAILURE_THRESHOLD_SETTING_KEY = 'worker_bein_login_failure_threshold'
export const DEFAULT_BEIN_LOGIN_FAILURE_THRESHOLD = 3
export const MIN_BEIN_LOGIN_FAILURE_THRESHOLD = 1
export const MAX_BEIN_LOGIN_FAILURE_THRESHOLD = 20

export function normalizeBeinLoginFailureThreshold(value: unknown): number {
    const parsedValue =
        typeof value === 'number'
            ? value
            : typeof value === 'string' && value.trim() !== ''
                ? Number.parseInt(value, 10)
                : Number.NaN

    if (
        !Number.isInteger(parsedValue) ||
        parsedValue < MIN_BEIN_LOGIN_FAILURE_THRESHOLD ||
        parsedValue > MAX_BEIN_LOGIN_FAILURE_THRESHOLD
    ) {
        return DEFAULT_BEIN_LOGIN_FAILURE_THRESHOLD
    }

    return parsedValue
}

export function validateBeinLoginFailureThreshold(value: unknown): { value: string } | { error: string } {
    if (typeof value !== 'string' && typeof value !== 'number') {
        return { error: `beIN login failure threshold must be an integer between ${MIN_BEIN_LOGIN_FAILURE_THRESHOLD} and ${MAX_BEIN_LOGIN_FAILURE_THRESHOLD}` }
    }

    const normalizedValue = String(value).trim()

    if (!/^\d+$/.test(normalizedValue)) {
        return { error: `beIN login failure threshold must be an integer between ${MIN_BEIN_LOGIN_FAILURE_THRESHOLD} and ${MAX_BEIN_LOGIN_FAILURE_THRESHOLD}` }
    }

    const parsedValue = Number.parseInt(normalizedValue, 10)

    if (
        parsedValue < MIN_BEIN_LOGIN_FAILURE_THRESHOLD ||
        parsedValue > MAX_BEIN_LOGIN_FAILURE_THRESHOLD
    ) {
        return { error: `beIN login failure threshold must be between ${MIN_BEIN_LOGIN_FAILURE_THRESHOLD} and ${MAX_BEIN_LOGIN_FAILURE_THRESHOLD}` }
    }

    return { value: String(parsedValue) }
}
