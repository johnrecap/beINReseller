export const BALANCE_QUEUE_MS = 300_000
export const BALANCE_RUN_MS = 60_000
export const BALANCE_MAX_MS = BALANCE_QUEUE_MS + BALANCE_RUN_MS
export const BALANCE_RECORD_SECONDS = 660
export const BALANCE_RESULT_SECONDS = 300
export const BALANCE_POLL_MS = 2_000
const balanceErrors = ['ACCOUNT_UNAVAILABLE', 'ACCOUNT_BUSY', 'LOGIN_FAILED', 'CAPTCHA_REQUIRED',
    'CONNECTION_FAILED', 'PROVIDER_RATE_LIMITED', 'BALANCE_NOT_FOUND', 'BALANCE_TIMEOUT', 'BALANCE_FAILED',
    'QUEUE_UNAVAILABLE', 'STATUS_UNAVAILABLE', 'REQUEST_NOT_FOUND'] as const
export type BalanceRefreshError = typeof balanceErrors[number]
export function safeBalanceError(value: unknown): BalanceRefreshError {
    return balanceErrors.find(code => code === value) ?? 'BALANCE_FAILED'
}
export interface BalanceObservation { balance: number; updatedAt: string }
export interface BalanceRefreshRequest {
    requestId: string
    accountId: string
    state: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'
    createdAt: number
    deadline: number
    expiresAt: number
    runToken?: string
    balance?: number
    updatedAt?: string
    errorCode?: BalanceRefreshError
}
export type BalanceRefreshTerminal = ({ state: 'COMPLETED' } & BalanceObservation) |
    { state: 'FAILED'; errorCode: BalanceRefreshError }

export function validBalanceObservation(value: { balance?: unknown; updatedAt?: unknown }): value is BalanceObservation {
    return typeof value.balance === 'number' && Number.isFinite(value.balance) && value.balance >= 0 &&
        typeof value.updatedAt === 'string' && /^\d{4}-\d\d-\d\dT/.test(value.updatedAt) && Number.isFinite(Date.parse(value.updatedAt))
}

export function balanceRefreshView(request: BalanceRefreshRequest) {
    return { requestId: request.requestId, accountId: request.accountId, state: request.state,
        createdAt: request.createdAt, deadline: request.deadline, pollAfterMs: BALANCE_POLL_MS,
        ...(request.state === 'COMPLETED' && validBalanceObservation(request) ? { balance: request.balance, updatedAt: request.updatedAt } : {}),
        ...(request.state === 'FAILED' ? { errorCode: request.errorCode ?? 'BALANCE_FAILED' as const } : {}),
    }
}
