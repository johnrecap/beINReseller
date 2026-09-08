/**
 * Account Pool Manager
 * Manages the smart distribution of beIN accounts using Round Robin
 * with rate limiting, cooldowns, and health tracking
 */

import Redis from 'ioredis'
import { prisma } from '../lib/prisma'
import { getRedisConnection } from '../lib/redis'
import { PoolConfig, AccountHealth, PoolStatus, BeinAccount } from './types'
import { checkRateLimit, recordRequest } from './rate-limiter'
import {
    acquireAccountExecutionLease,
    assertAccountExecutionLease,
    extendLock,
    isAccountExecutionLeaseActive,
    isAccountLocked,
    lockAccount,
    releaseAccountExecutionLease,
    renewAccountExecutionLease,
    unlockAccount,
    type AccountExecutionLeaseHandle,
} from './account-locking'
import { decryptAccountPassword } from '../lib/crypto'
import {
    acquireProviderAccountCausalReservation,
    assertActiveProviderAccountReservation,
    decideProviderAccountConsumerAccess,
    findActiveProviderAccountReservationForAccount,
    findActiveProviderAccountReservationForOperation,
    isProviderAccountAutomationEligible,
    renewProviderAccountCausalReservation,
} from '../lib/provider-account-reservation'
import type { ProviderAccountCausalReservation } from '@prisma/client'

const COUNTER_KEY = 'bein:pool:counter'
const COOLDOWN_PREFIX = 'bein:account:cooldown:'
const ACCOUNT_LOCK_TTL_SECONDS = 300

export interface ReservedAccountAcquisition {
    account: BeinAccount
    reservation: ProviderAccountCausalReservation
    lease: AccountExecutionLeaseHandle
}

export interface ReservedAccountAcquisitionRequest {
    operationId: string
    leaseId: string
    automaticWindowEndsAt: Date
    excludeAccountIds?: string[]
    minBalance?: number
}

export class AccountPoolManager {
    private redis: Redis
    private config: PoolConfig
    private workerId: string
    private configLoaded: boolean = false
    private customerOnly: boolean | undefined  // Filter for customerOnly accounts

    constructor(redisUrl?: string, workerId?: string, options?: { customerOnly?: boolean }) {
        // Use shared Redis connection instead of creating a new one
        this.redis = getRedisConnection(redisUrl)
        this.workerId = workerId || `worker-${process.pid}-${Date.now()}`
        this.customerOnly = options?.customerOnly  // Store customer filter option

        // Default config (will be overwritten by loadConfig)
        this.config = {
            maxRequestsPerAccount: 5,
            rateLimitWindowSeconds: 300,
            cooldownAfterFailures: 3,
            cooldownDurationSeconds: 600,
            minDelayMs: 2000,
            maxDelayMs: 5000,
            maxConsecutiveFailures: 5,
            autoDisableOnError: true,
        }
    }

    /**
     * Initialize the pool manager
     * Must be called before using other methods
     */
    async initialize(): Promise<void> {
        await this.loadConfig()
        console.log(`🔧 AccountPoolManager initialized (Worker: ${this.workerId})`)
    }

    /**
     * Get the next available account using Round Robin
     * Skips accounts that are rate-limited, in cooldown, or locked
     */
    async getNextAvailableAccount(operationId?: string): Promise<BeinAccount | null> {
        if (!this.configLoaded) {
            await this.loadConfig()
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const whereClause: Record<string, any> = {
            isActive: true,
            automationExclusive: true,
            providerAccountCausalReservations: {
                none: { releasedAt: null },
            },
            OR: [
                { cooldownUntil: null },
                { cooldownUntil: { lte: new Date() } },
            ],
        }

        // Apply customerOnly filter if set
        if (this.customerOnly !== undefined) {
            whereClause.customerOnly = this.customerOnly
        }

        // Get all active accounts not in cooldown
        const accounts = await prisma.beinAccount.findMany({
            where: whereClause,
            include: {
                proxy: true,  // Include proxy relation for session ID
            },
            orderBy: [
                { priority: 'desc' },
                { lastUsedAt: 'asc' }, // Least recently used first
            ],
        })

        if (accounts.length === 0) {
            console.error('❌ No active accounts available!')
            return null
        }

        // Round Robin with rate limit and lock checking
        const counter = await this.redis.incr(COUNTER_KEY)
        const startIndex = counter % accounts.length

        for (let i = 0; i < accounts.length; i++) {
            const idx = (startIndex + i) % accounts.length
            const account = accounts[idx]

            // Check account health
            const health = await this.checkAccountHealth(account.id)
            if (!health.isAvailable) {
                console.log(`⏭️ Skipping ${account.label || account.username}: ${health.reason}`)
                continue
            }


            console.log(`✅ Selected account: ${account.label || account.username} (ID: ${account.id})`)
            const locked = await lockAccount(this.redis, account.id, this.workerId, ACCOUNT_LOCK_TTL_SECONDS, operationId)
            if (!locked) {
                console.log(`Skipping ${account.label || account.username}: lock was taken`)
                continue
            }
            if (!await this.confirmUnreservedConsumerLock(account.id, operationId)) {
                console.log(`Skipping ${account.label || account.username}: causal reservation appeared after selection`)
                continue
            }

            return decryptAccountPassword(account)
        }

        console.warn('⚠️ All accounts are rate-limited, in cooldown, or locked')
        return null
    }

    /**
     * Acquire the durable provider-account reservation and its short fenced
     * execution lease as one caller-visible result. Callers must retain the
     * returned handle and use it for every provider mutation/session write.
     */
    async acquireReservedAccount(
        input: ReservedAccountAcquisitionRequest
    ): Promise<ReservedAccountAcquisition | null> {
        if (!this.configLoaded) await this.loadConfig()
        if (
            !input.operationId.trim() ||
            !input.leaseId.trim() ||
            !Number.isFinite(input.automaticWindowEndsAt.getTime()) ||
            input.automaticWindowEndsAt.getTime() <= Date.now()
        ) {
            return null
        }

        const existingReservation = await findActiveProviderAccountReservationForOperation(
            prisma,
            input.operationId
        )
        if (existingReservation) {
            if (input.excludeAccountIds?.includes(existingReservation.beinAccountId)) return null
            const account = await prisma.beinAccount.findUnique({
                where: { id: existingReservation.beinAccountId },
                include: { proxy: true },
            })
            if (
                !account ||
                !isProviderAccountAutomationEligible(account) ||
                (input.minBalance !== undefined && (account.dealerBalance ?? -Infinity) < input.minBalance)
            ) {
                return null
            }
            const health = await this.checkAccountHealth(account.id, input.operationId)
            if (!health.isAvailable) return null

            const durableReservationRenewed = await renewProviderAccountCausalReservation(
                prisma,
                {
                    operationId: input.operationId,
                    beinAccountId: account.id,
                    reservationGeneration: existingReservation.reservationGeneration,
                    automaticWindowEndsAt: input.automaticWindowEndsAt,
                }
            )
            if (!durableReservationRenewed) return null

            const lease = await acquireAccountExecutionLease(this.redis, {
                accountId: account.id,
                operationId: input.operationId,
                reservationGeneration: existingReservation.reservationGeneration,
                leaseId: input.leaseId,
                workerId: this.workerId,
            })
            if (!lease) return null
            const reservationStillCurrent = await assertActiveProviderAccountReservation(prisma, {
                operationId: input.operationId,
                beinAccountId: account.id,
                reservationGeneration: existingReservation.reservationGeneration,
            })
            if (!reservationStillCurrent) {
                await releaseAccountExecutionLease(this.redis, lease)
                return null
            }
            return {
                account: decryptAccountPassword(account),
                reservation: existingReservation,
                lease,
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const whereClause: Record<string, any> = {
            isActive: true,
            automationExclusive: true,
            providerAccountCausalReservations: { none: { releasedAt: null } },
            OR: [
                { cooldownUntil: null },
                { cooldownUntil: { lte: new Date() } },
            ],
            ...(input.excludeAccountIds?.length
                ? { id: { notIn: input.excludeAccountIds } }
                : {}),
            ...(input.minBalance !== undefined
                ? { dealerBalance: { gte: input.minBalance } }
                : {}),
        }
        if (this.customerOnly !== undefined) whereClause.customerOnly = this.customerOnly

        const accounts = await prisma.beinAccount.findMany({
            where: whereClause,
            include: { proxy: true },
            orderBy: [
                { priority: 'desc' },
                { dealerBalance: 'desc' },
                { lastUsedAt: 'asc' },
            ],
        })
        if (accounts.length === 0) return null
        const counter = await this.redis.incr(COUNTER_KEY)
        const startIndex = counter % accounts.length

        for (let index = 0; index < accounts.length; index++) {
            const account = accounts[(startIndex + index) % accounts.length]
            const health = await this.checkAccountHealth(account.id)
            if (!health.isAvailable) continue

            const claim = await prisma.$transaction((tx) =>
                acquireProviderAccountCausalReservation(tx, {
                    operationId: input.operationId,
                    beinAccountId: account.id,
                    automaticWindowEndsAt: input.automaticWindowEndsAt,
                })
            )
            if (claim.status !== 'ACQUIRED' && claim.status !== 'ALREADY_HELD') {
                if (claim.status === 'OPERATION_ALREADY_RESERVED') return null
                continue
            }
            const reservation = claim.reservation

            // Close the keepalive/legacy race after the database claim.
            const healthAfterClaim = await this.checkAccountHealth(account.id, input.operationId)
            if (!healthAfterClaim.isAvailable) return null
            const lease = await acquireAccountExecutionLease(this.redis, {
                accountId: account.id,
                operationId: input.operationId,
                reservationGeneration: reservation.reservationGeneration,
                leaseId: input.leaseId,
                workerId: this.workerId,
            })
            if (!lease) return null

            const reservationStillCurrent = await assertActiveProviderAccountReservation(prisma, {
                operationId: input.operationId,
                beinAccountId: account.id,
                reservationGeneration: reservation.reservationGeneration,
            })
            if (!reservationStillCurrent) {
                await releaseAccountExecutionLease(this.redis, lease)
                return null
            }
            return {
                account: decryptAccountPassword(account),
                reservation,
                lease,
            }
        }
        return null
    }

    async assertExecutionLease(handle: AccountExecutionLeaseHandle): Promise<boolean> {
        if (!await assertActiveProviderAccountReservation(prisma, {
            operationId: handle.operationId,
            beinAccountId: handle.accountId,
            reservationGeneration: handle.reservationGeneration,
        })) return false
        return assertAccountExecutionLease(this.redis, handle)
    }

    async renewExecutionLease(handle: AccountExecutionLeaseHandle): Promise<boolean> {
        if (!await renewAccountExecutionLease(this.redis, handle)) return false
        const reservationRenewed = await renewProviderAccountCausalReservation(prisma, {
            operationId: handle.operationId,
            beinAccountId: handle.accountId,
            reservationGeneration: handle.reservationGeneration,
        })
        if (!reservationRenewed) {
            await releaseAccountExecutionLease(this.redis, handle)
            return false
        }
        return true
    }

    async releaseExecutionLease(handle: AccountExecutionLeaseHandle): Promise<boolean> {
        return releaseAccountExecutionLease(this.redis, handle)
    }

    /**
     * Mark an account as successfully used
     * Records the usage and resets consecutive failures
     */
    async markAccountUsed(accountId: string, operationId?: string, options?: { durableCompletionCounters?: boolean }): Promise<void> {
        try {
        // Record request for rate limiting
        await recordRequest(this.redis, accountId, this.config.rateLimitWindowSeconds)

        // Update database
        if (!options?.durableCompletionCounters) await prisma.beinAccount.update({
            where: { id: accountId },
            data: {
                lastUsedAt: new Date(),
                usageCount: { increment: 1 },
                totalSuccess: { increment: 1 },
                consecutiveFailures: 0, // Reset on success
            },
        })


        console.log(`📊 Account ${accountId} marked as used`)
        } finally {
            await this.releaseLock(accountId, operationId)
        }
    }

    /**
     * Mark an account as failed
     * Tracks failures and applies cooldown if threshold reached
     */
    async markAccountFailed(accountId: string, error: string, operationId?: string): Promise<void> {
        try {
        const account = await prisma.beinAccount.update({
            where: { id: accountId },
            data: {
                consecutiveFailures: { increment: 1 },
                totalFailures: { increment: 1 },
                lastError: error.substring(0, 500), // Limit error length
                lastErrorAt: new Date(),
            },
        })

        // Apply cooldown if threshold reached
        if (account.consecutiveFailures >= this.config.cooldownAfterFailures) {
            await this.setCooldown(accountId, this.config.cooldownDurationSeconds)
            console.log(`⏳ Account ${accountId} put in cooldown after ${account.consecutiveFailures} failures`)
        }

        // Auto-disable if max failures reached
        if (
            this.config.autoDisableOnError &&
            account.consecutiveFailures >= this.config.maxConsecutiveFailures
        ) {
            await prisma.beinAccount.update({
                where: { id: accountId },
                data: { isActive: false },
            })
            console.error(`🚫 Account ${accountId} auto-disabled after ${account.consecutiveFailures} consecutive failures`)
        }


        console.log(`❌ Account ${accountId} marked as failed: ${error}`)
        } finally {
            await this.releaseLock(accountId, operationId)
        }
    }

    /**
     * Put an account in cooldown
     */
    async setCooldown(accountId: string, seconds: number): Promise<void> {
        const cooldownUntil = new Date(Date.now() + seconds * 1000)

        // Update database
        await prisma.beinAccount.update({
            where: { id: accountId },
            data: { cooldownUntil },
        })

        // Set Redis key for fast checking
        await this.redis.setex(`${COOLDOWN_PREFIX}${accountId}`, seconds, '1')

        console.log(`⏳ Account ${accountId} in cooldown for ${seconds}s (until ${cooldownUntil.toISOString()})`)
    }

    /**
     * Clear cooldown for an account
     */
    async clearCooldown(accountId: string): Promise<void> {
        await prisma.beinAccount.update({
            where: { id: accountId },
            data: { cooldownUntil: null },
        })

        await this.redis.del(`${COOLDOWN_PREFIX}${accountId}`)

        console.log(`✅ Cooldown cleared for account ${accountId}`)
    }

    /**
     * Check the health status of an account
     */
    async checkAccountHealth(
        accountId: string,
        allowedReservationOperationId?: string
    ): Promise<AccountHealth> {
        const [account, activeReservation] = await Promise.all([
            prisma.beinAccount.findUnique({
                where: { id: accountId },
                select: { isActive: true, automationExclusive: true },
            }),
            findActiveProviderAccountReservationForAccount(prisma, accountId),
        ])
        if (!account || !isProviderAccountAutomationEligible(account)) {
            return {
                isAvailable: false,
                reason: 'Account is not automation-exclusive and active',
                requestsInWindow: 0,
            }
        }
        if (
            activeReservation &&
            activeReservation.operationId !== allowedReservationOperationId
        ) {
            return {
                isAvailable: false,
                reason: 'Account has an active causal reservation',
                requestsInWindow: 0,
            }
        }

        // Check cooldown in Redis (fast)
        const cooldownTTL = await this.redis.ttl(`${COOLDOWN_PREFIX}${accountId}`)
        if (cooldownTTL > 0) {
            return {
                isAvailable: false,
                reason: `In cooldown (${cooldownTTL}s remaining)`,
                requestsInWindow: 0,
                cooldownRemaining: cooldownTTL,
            }
        }

        // Check if locked by another worker
        const locked = await isAccountLocked(this.redis, accountId)
        if (locked) {
            return {
                isAvailable: false,
                reason: 'Locked by another worker',
                requestsInWindow: 0,
            }
        }

        if (await isAccountExecutionLeaseActive(this.redis, accountId)) {
            return {
                isAvailable: false,
                reason: 'Account has an active execution lease',
                requestsInWindow: 0,
            }
        }

        // Check rate limit
        const rateLimit = await checkRateLimit(
            this.redis,
            accountId,
            this.config.maxRequestsPerAccount,
            this.config.rateLimitWindowSeconds
        )

        if (!rateLimit.allowed) {
            return {
                isAvailable: false,
                reason: `Rate limited (${rateLimit.currentCount}/${this.config.maxRequestsPerAccount})`,
                requestsInWindow: rateLimit.currentCount,
            }
        }

        return {
            isAvailable: true,
            requestsInWindow: rateLimit.currentCount,
        }
    }

    /**
     * Get the overall pool status
     */
    async getPoolStatus(): Promise<PoolStatus> {
        const accounts = await prisma.beinAccount.findMany()

        let available = 0
        let inCooldown = 0
        let rateLimited = 0

        for (const account of accounts) {
            if (!isProviderAccountAutomationEligible(account)) continue

            const health = await this.checkAccountHealth(account.id)
            if (health.isAvailable) {
                available++
            } else if (health.cooldownRemaining) {
                inCooldown++
            } else {
                rateLimited++
            }
        }

        return {
            totalAccounts: accounts.length,
            activeAccounts: accounts.filter(isProviderAccountAutomationEligible).length,
            availableNow: available,
            inCooldown,
            rateLimited,
        }
    }

    /**
     * Get a random delay for human-like behavior
     */
    getRandomDelay(): number {
        const { minDelayMs, maxDelayMs } = this.config
        return Math.floor(Math.random() * (maxDelayMs - minDelayMs) + minDelayMs)
    }

    /**
     * Load configuration from database
     */
    async loadConfig(): Promise<void> {
        const settings = await prisma.setting.findMany({
            where: { key: { startsWith: 'pool_' } },
        })

        const get = (key: string, fallback: string) => {
            return settings.find((s) => s.key === key)?.value || fallback
        }

        this.config = {
            maxRequestsPerAccount: parseInt(get('pool_max_requests_per_account', '5')),
            rateLimitWindowSeconds: parseInt(get('pool_rate_limit_window_seconds', '300')),
            cooldownAfterFailures: parseInt(get('pool_cooldown_after_failures', '3')),
            cooldownDurationSeconds: parseInt(get('pool_cooldown_duration_seconds', '600')),
            minDelayMs: parseInt(get('pool_min_delay_ms', '2000')),
            maxDelayMs: parseInt(get('pool_max_delay_ms', '5000')),
            maxConsecutiveFailures: parseInt(get('pool_max_consecutive_failures', '5')),
            autoDisableOnError: get('pool_auto_disable_on_error', 'true') === 'true',
        }

        this.configLoaded = true
        console.log('🔄 Pool config loaded:', this.config)
    }

    /**
     * Reload configuration from database
     */
    async reloadConfig(): Promise<void> {
        await this.loadConfig()
        console.log('🔄 Pool config reloaded')
    }

    /**
     * Get current configuration
     */
    getConfig(): PoolConfig {
        return { ...this.config }
    }

    /**
     * Get the worker ID
     */
    getWorkerId(): string {
        return this.workerId
    }

    /**
     * Release a lock for a specific account (cleanup)
     */
    async releaseLock(accountId: string, operationId?: string): Promise<boolean> {
        const released = await unlockAccount(this.redis, accountId, this.workerId, operationId)
        if (released) {
            console.log(`Released lock for account ${accountId}`)
        }
        return released
    }

    /**
     * Extend the lock TTL (heartbeat keep-alive)
     * Call this periodically during long operations to prevent expiry
     */
    async renewLock(accountId: string, operationId?: string): Promise<void> {
        const renewed = await extendLock(this.redis, accountId, this.workerId, ACCOUNT_LOCK_TTL_SECONDS, operationId)
        if (!renewed) {
            console.warn(`Failed to renew lock for account ${accountId}`)
        }
    }

    /**
     * Force release a lock (for cleanup cron or admin use)
     * This releases the lock regardless of owner
     */
    async forceReleaseLock(accountId: string): Promise<void> {
        const key = `bein:account:lock:${accountId}`
        await this.redis.del(key)
        console.log(`🔓 Force released lock for account ${accountId}`)
    }

    /**
     * Get next available account with retry and backoff
     * 
     * This method retries getting an account with exponential backoff
     * instead of failing immediately when no accounts are available.
     * 
     * @param maxRetries - Maximum retry attempts (default 5)
     * @param initialDelayMs - Initial delay between retries (default 1000ms)
     * @param maxDelayMs - Maximum delay between retries (default 10000ms)
     */
    async getNextAvailableAccountWithRetry(
        maxRetries: number = 5,
        initialDelayMs: number = 1000,
        maxDelayMs: number = 10000,
        operationId?: string
    ): Promise<BeinAccount | null> {
        let delay = initialDelayMs

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const account = await this.getNextAvailableAccount(operationId)
            if (account) {
                if (attempt > 0) {
                    console.log(`✅ Got account on retry ${attempt}: ${account.username}`)
                }
                return account
            }

            if (attempt < maxRetries) {
                console.log(`⏳ No accounts available, retry ${attempt + 1}/${maxRetries} in ${delay}ms`)
                await new Promise(resolve => setTimeout(resolve, delay))

                // Exponential backoff
                delay = Math.min(delay * 1.5, maxDelayMs)
            }
        }

        console.warn(`⚠️ Failed to get account after ${maxRetries} retries`)
        return null
    }

    /**
     * Get next available account, excluding specific accounts
     * Used for retrying with a different account when current one has issues
     * (e.g., insufficient balance, login failure, session issues)
     * 
     * @param excludeAccountIds - Account IDs to skip
     * @param minBalance - Minimum dealer balance required (optional)
     * @returns An available account or null
     */
    async getNextAvailableAccountExcluding(
        excludeAccountIds: string[],
        minBalance?: number,
        operationId?: string
    ): Promise<BeinAccount | null> {
        if (!this.configLoaded) {
            await this.loadConfig()
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const whereClause: Record<string, any> = {
            isActive: true,
            automationExclusive: true,
            providerAccountCausalReservations: {
                none: { releasedAt: null },
            },
            id: { notIn: excludeAccountIds },
            OR: [
                { cooldownUntil: null },
                { cooldownUntil: { lte: new Date() } },
            ],
        }

        // Add balance filter if specified
        if (minBalance !== undefined) {
            whereClause.dealerBalance = { gte: minBalance }
        }

        // Apply customerOnly filter if set
        if (this.customerOnly !== undefined) {
            whereClause.customerOnly = this.customerOnly
        }

        const accounts = await prisma.beinAccount.findMany({
            where: whereClause,
            include: { proxy: true },
            orderBy: [
                { priority: 'desc' },
                { dealerBalance: 'desc' },  // Prefer accounts with more balance
                { lastUsedAt: 'asc' },      // Then least recently used
            ],
        })

        console.log(`[Pool] Looking for alternative account (excluding ${excludeAccountIds.length}, minBalance: ${minBalance || 'any'})`)
        console.log(`[Pool] Found ${accounts.length} candidate accounts`)

        if (accounts.length === 0) {
            console.log(`❌ No alternative accounts available`)
            return null
        }

        // Try to get an available, unlocked account
        for (const account of accounts) {
            const health = await this.checkAccountHealth(account.id)
            if (!health.isAvailable) {
                console.log(`⏭️ Skipping ${account.label || account.username}: ${health.reason}`)
                continue
            }


            console.log(`✅ Selected alternative account: ${account.label || account.username} (Balance: ${account.dealerBalance || 'unknown'} USD)`)
            const locked = await lockAccount(this.redis, account.id, this.workerId, ACCOUNT_LOCK_TTL_SECONDS, operationId)
            if (!locked) {
                console.log(`Skipping ${account.label || account.username}: lock was taken`)
                continue
            }
            if (!await this.confirmUnreservedConsumerLock(account.id, operationId)) {
                console.log(`Skipping ${account.label || account.username}: causal reservation appeared after selection`)
                continue
            }

            return decryptAccountPassword(account)
        }

        console.warn('⚠️ All alternative accounts are unavailable')
        return null
    }

    /**
     * Check if any account is currently available (without acquiring)
     * Useful for checking pool status before entering queue
     */
    async hasAvailableAccount(): Promise<boolean> {
        if (!this.configLoaded) {
            await this.loadConfig()
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const whereClause: Record<string, any> = {
            isActive: true,
            automationExclusive: true,
            providerAccountCausalReservations: {
                none: { releasedAt: null },
            },
            OR: [
                { cooldownUntil: null },
                { cooldownUntil: { lte: new Date() } },
            ],
        }

        // Apply customerOnly filter if set
        if (this.customerOnly !== undefined) {
            whereClause.customerOnly = this.customerOnly
        }

        const accounts = await prisma.beinAccount.findMany({
            where: whereClause,
            select: { id: true }
        })

        for (const account of accounts) {
            const health = await this.checkAccountHealth(account.id)
            if (health.isAvailable) {
                return true
            }
        }

        return false
    }

    /**
     * Get Redis connection (for queue manager)
     */
    getRedis(): Redis {
        return this.redis
    }

    private async confirmUnreservedConsumerLock(
        accountId: string,
        operationId?: string
    ): Promise<boolean> {
        const activeReservation = await findActiveProviderAccountReservationForAccount(
            prisma,
            accountId
        )
        const decision = decideProviderAccountConsumerAccess({
            consumer: 'POOL_SELECTION',
            activeReservation: activeReservation
                ? {
                    operationId: activeReservation.operationId,
                    reservationGeneration: activeReservation.reservationGeneration,
                }
                : null,
            requester: null,
        })
        if (decision.allowed) return true

        await unlockAccount(this.redis, accountId, this.workerId, operationId)
        return false
    }

    /**
     * Close connection (no-op since we use shared Redis)
     */
    async close(): Promise<void> {
        // Don't close Redis - it's shared with other components
        // The main index.ts will close it during shutdown
        console.log('🔌 AccountPoolManager disconnected (shared Redis remains open)')
    }
}

// Singleton instance for the worker
let poolManagerInstance: AccountPoolManager | null = null

export function getPoolManager(redisUrl: string, workerId?: string, options?: { customerOnly?: boolean }): AccountPoolManager {
    // For customer-only pool, don't use singleton (separate instance)
    if (options?.customerOnly !== undefined) {
        return new AccountPoolManager(redisUrl, workerId, options)
    }
    if (!poolManagerInstance) {
        poolManagerInstance = new AccountPoolManager(redisUrl, workerId)
    }
    return poolManagerInstance
}

export async function initializePoolManager(redisUrl: string, workerId?: string, options?: { customerOnly?: boolean }): Promise<AccountPoolManager> {
    const manager = getPoolManager(redisUrl, workerId, options)
    await manager.initialize()
    return manager
}
