import type { LoginFailureReason } from "@/lib/auth/login-attempts"

const FORBIDDEN_DIAGNOSTIC_KEYS = [
    "authorization",
    "cookie",
    "hash",
    "password",
    "secret",
    "session",
    "token",
]

export type LoginDiagnosticEvent = {
    timestamp: string
    reasonCategory: LoginFailureReason
    exactLoginName: string
    matchedUserId: string | null
    contextFingerprint: string
    failedCount: number | null
    cooldownUntil: number | null
}

type LoginDiagnosticInput = Partial<LoginDiagnosticEvent> & Record<string, unknown>

function isForbiddenKey(key: string): boolean {
    const lowerKey = key.toLowerCase()
    return FORBIDDEN_DIAGNOSTIC_KEYS.some(forbidden => lowerKey.includes(forbidden))
}

export function redactLoginDiagnosticInput(input: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(input)) {
        if (isForbiddenKey(key)) {
            continue
        }

        if (value && typeof value === "object" && !Array.isArray(value)) {
            redacted[key] = redactLoginDiagnosticInput(value as Record<string, unknown>)
            continue
        }

        if (Array.isArray(value)) {
            redacted[key] = value.map(item => {
                if (item && typeof item === "object") {
                    return redactLoginDiagnosticInput(item as Record<string, unknown>)
                }
                return item
            })
            continue
        }

        redacted[key] = value
    }

    return redacted
}

export function buildLoginDiagnosticEvent(input: LoginDiagnosticInput): LoginDiagnosticEvent {
    const redacted = redactLoginDiagnosticInput(input)

    return {
        timestamp: typeof redacted.timestamp === "string" ? redacted.timestamp : new Date().toISOString(),
        reasonCategory: (redacted.reasonCategory as LoginFailureReason) || "unexpected_error",
        exactLoginName: typeof redacted.exactLoginName === "string" ? redacted.exactLoginName : "",
        matchedUserId: typeof redacted.matchedUserId === "string" ? redacted.matchedUserId : null,
        contextFingerprint: typeof redacted.contextFingerprint === "string" ? redacted.contextFingerprint : "",
        failedCount: typeof redacted.failedCount === "number" ? redacted.failedCount : null,
        cooldownUntil: typeof redacted.cooldownUntil === "number" ? redacted.cooldownUntil : null,
    }
}

export function logLoginDiagnostic(input: LoginDiagnosticInput): void {
    const event = buildLoginDiagnosticEvent(input)
    console.warn("[auth] login diagnostic", event)
}
