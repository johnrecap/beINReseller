/**
 * Account Pool Manager
 * Manages the smart distribution of beIN accounts using Round Robin
 * with rate limiting, cooldowns, and health tracking
 */

import Redis from 'ioredis'
import { prisma } from '../lib/prisma'
import { PoolConfig, AccountHealth, PoolStatus, BeinAccount } from './types'
import { checkRateLimit, recordRequest } from './rate-limiter'
import { lockAccount, unlockAccount, isAccountLocked } from './account-locking'

const COUNTER_KEY = 'bein:pool:counter'
const COOLDOWN_PREFIX = 'bein:account:cooldown:'

export class AccountPoolManager {
    private redis: Redis
    private config: PoolConfig
    private workerId: string
    private configLoaded: boolean = false

    constructor(redisUrl: string, workerId?: string) {
        this.redis = new Redis(redisUrl)
        this.workerId = workerId || `worker-${process.pid}-${Date.now()}`

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
    async getNextAvailableAccount(): Promise<BeinAccount | null> {
        if (!this.configLoaded) {
            await this.loadConfig()
        }

        // Get all active accounts not in cooldown
        const accounts = await prisma.beinAccount.findMany({
            where: {
                isActive: true,
                OR: [
                    { cooldownUntil: null },
                    { cooldownUntil: { lte: new Date() } },
                ],
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

            // Try to acquire lock
            const locked = await lockAccount(this.redis, account.id, this.workerId)
            if (!locked) {
                console.log(`🔒 Account ${account.label || account.username} is locked by another worker`)
                continue
            }

            console.log(`✅ Selected account: ${account.label || account.username} (ID: ${account.id})`)
            return account
        }

        console.warn('⚠️ All accounts are rate-limited, in cooldown, or locked')
        return null
    }

    /**
     * Mark an account as successfully used
     * Records the usage and resets consecutive failures
     */
    async markAccountUsed(accountId: string): Promise<void> {
        // Record request for rate limiting
        await recordRequest(this.redis, accountId, this.config.rateLimitWindowSeconds)

        // Update database
        await prisma.beinAccount.update({
            where: { id: accountId },
            data: {
                lastUsedAt: new Date(),
                usageCount: { increment: 1 },
                totalSuccess: { increment: 1 },
                consecutiveFailures: 0, // Reset on success
            },
        })

        // Release the lock
        await unlockAccount(this.redis, accountId, this.workerId)

        console.log(`📊 Account ${accountId} marked as used`)
    }

    /**
     * Mark an account as failed
     * Tracks failures and applies cooldown if threshold reached
     */
    async markAccountFailed(accountId: string, error: string): Promise<void> {
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

        // Release the lock
        await unlockAccount(this.redis, accountId, this.workerId)

        console.log(`❌ Account ${accountId} marked as failed: ${error}`)
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
    async checkAccountHealth(accountId: string): Promise<AccountHealth> {
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
            if (!account.isActive) continue

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
            activeAccounts: accounts.filter((a) => a.isActive).length,
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
    async releaseLock(accountId: string): Promise<void> {
        await unlockAccount(this.redis, accountId, this.workerId)
    }

    /**
     * Close Redis connection
     */
    async close(): Promise<void> {
        await this.redis.quit()
        console.log('🔌 AccountPoolManager connection closed')
    }
}

// Singleton instance for the worker
let poolManagerInstance: AccountPoolManager | null = null

export function getPoolManager(redisUrl: string, workerId?: string): AccountPoolManager {
    if (!poolManagerInstance) {
        poolManagerInstance = new AccountPoolManager(redisUrl, workerId)
    }
    return poolManagerInstance
}

export async function initializePoolManager(redisUrl: string, workerId?: string): Promise<AccountPoolManager> {
    const manager = getPoolManager(redisUrl, workerId)
    await manager.initialize()
    return manager
}
