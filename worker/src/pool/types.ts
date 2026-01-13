/**
 * Account Pool Manager Types
 * Shared types for the beIN account pool management system
 */

export interface PoolConfig {
    /** Maximum requests per account in the rate limit window */
    maxRequestsPerAccount: number
    /** Rate limit window in seconds (e.g., 300 = 5 minutes) */
    rateLimitWindowSeconds: number
    /** Number of failures before applying cooldown */
    cooldownAfterFailures: number
    /** Cooldown duration in seconds */
    cooldownDurationSeconds: number
    /** Minimum delay between requests in milliseconds */
    minDelayMs: number
    /** Maximum delay between requests in milliseconds */
    maxDelayMs: number
    /** Maximum consecutive failures before auto-disable */
    maxConsecutiveFailures: number
    /** Whether to auto-disable on permanent error */
    autoDisableOnError: boolean
}

export interface AccountHealth {
    /** Whether the account is available for use */
    isAvailable: boolean
    /** Reason if not available */
    reason?: string
    /** Number of requests in the current rate limit window */
    requestsInWindow: number
    /** Remaining cooldown time in seconds */
    cooldownRemaining?: number
}

export interface PoolStatus {
    /** Total number of accounts in the pool */
    totalAccounts: number
    /** Number of active accounts */
    activeAccounts: number
    /** Number of accounts available right now */
    availableNow: number
    /** Number of accounts in cooldown */
    inCooldown: number
    /** Number of rate-limited accounts */
    rateLimited: number
}

export interface AccountHealthReport {
    accountId: string
    label: string
    status: 'healthy' | 'warning' | 'critical' | 'disabled'
    metrics: {
        successRate: number
        requestsInWindow: number
        consecutiveFailures: number
        lastUsedAt: Date | null
        cooldownRemaining: number | null
    }
}

// Re-export BeinAccount type from Prisma
export type { BeinAccount, BeinAccountSession } from '@prisma/client'
