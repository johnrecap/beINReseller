/**
 * Account Queue Manager
 * 
 * Provides a sequential queue for beIN account acquisition.
 * When multiple operations need the same account, they wait in queue
 * instead of failing with "No accounts available".
 * 
 * Features:
 * - Operations wait in queue for account availability (max 2 minutes)
 * - Exponential backoff between retry attempts
 * - Priority queue (can prioritize certain operations)
 * - Timeout handling to prevent infinite waits
 * - Integration with existing AccountPoolManager
 */

import Redis from 'ioredis'
import { getRedisConnection } from '../lib/redis'
import { AccountPoolManager } from './account-pool-manager'
import { BeinAccount } from './types'

// Queue configuration
const QUEUE_CONFIG = {
    maxWaitTimeMs: 120_000,         // 2 minutes max wait
    pollIntervalMs: 2000,           // Check every 2 seconds
    maxRetries: 60,                 // 2 minutes / 2 seconds = 60 retries
    backoffMultiplier: 1.5,         // Exponential backoff multiplier
    maxPollIntervalMs: 10_000,      // Max 10 seconds between polls
}

// Redis keys
const QUEUE_KEY = 'bein:account:queue'           // Sorted set for queue
const QUEUE_POSITION_KEY = 'bein:queue:position' // Track position counter

interface QueueEntry {
    operationId: string
    timestamp: number
    priority: number  // Higher = more priority (default 0)
}

interface QueueWaitResult {
    account: BeinAccount | null
    waitTimeMs: number
    retriesAttempted: number
    timedOut: boolean
    error?: string
}

export class AccountQueueManager {
    private redis: Redis
    private poolManager: AccountPoolManager

    constructor(poolManager: AccountPoolManager, redisUrl?: string) {
        this.redis = getRedisConnection(redisUrl)
        this.poolManager = poolManager
    }

    /**
     * Acquire account with queue wait
     * 
     * If no account is available, wait in queue until one becomes available
     * or timeout is reached.
     */
    async acquireAccountWithQueue(
        operationId: string,
        priority: number = 0,
        maxWaitMs: number = QUEUE_CONFIG.maxWaitTimeMs
    ): Promise<QueueWaitResult> {
        const startTime = Date.now()
        let retriesAttempted = 0
        let pollInterval = QUEUE_CONFIG.pollIntervalMs

        console.log(`[Queue] Operation ${operationId} requesting account (priority: ${priority})`)

        // First, try immediate acquisition
        let account = await this.poolManager.getNextAvailableAccount()
        if (account) {
            console.log(`[Queue] Operation ${operationId} got account immediately: ${account.username}`)
            return {
                account,
                waitTimeMs: Date.now() - startTime,
                retriesAttempted: 0,
                timedOut: false
            }
        }

        // No account available, enter queue
        await this.enterQueue(operationId, priority)
        console.log(`[Queue] Operation ${operationId} entered queue, waiting for account...`)

        try {
            while (true) {
                // Check timeout
                const elapsedMs = Date.now() - startTime
                if (elapsedMs >= maxWaitMs) {
                    console.log(`[Queue] Operation ${operationId} timed out after ${elapsedMs}ms`)
                    return {
                        account: null,
                        waitTimeMs: elapsedMs,
                        retriesAttempted,
                        timedOut: true,
                        error: `انتهت مهلة الانتظار في الطابور (${Math.round(maxWaitMs / 1000)} ثانية)`
                    }
                }

                // Check if operation was cancelled (prevent zombie waits)
                const cancelled = await this.isOperationCancelled(operationId)
                if (cancelled) {
                    console.log(`[Queue] Operation ${operationId} was cancelled while in queue`)
                    return {
                        account: null,
                        waitTimeMs: Date.now() - startTime,
                        retriesAttempted,
                        timedOut: false,
                        error: 'Operation cancelled'
                    }
                }

                // Wait before next poll
                await this.sleep(pollInterval)
                retriesAttempted++

                // Check queue position
                const position = await this.getQueuePosition(operationId)
                console.log(`[Queue] Operation ${operationId} at position ${position}, retry ${retriesAttempted}`)

                // Only try to acquire if we're at the front of queue (or near front)
                if (position <= 2) {
                    account = await this.poolManager.getNextAvailableAccount()
                    if (account) {
                        console.log(`[Queue] Operation ${operationId} acquired account ${account.username} after ${retriesAttempted} retries`)
                        return {
                            account,
                            waitTimeMs: Date.now() - startTime,
                            retriesAttempted,
                            timedOut: false
                        }
                    }
                }

                // Apply exponential backoff (with cap)
                pollInterval = Math.min(
                    pollInterval * QUEUE_CONFIG.backoffMultiplier,
                    QUEUE_CONFIG.maxPollIntervalMs
                )
            }
        } finally {
            // Always remove from queue when done
            await this.leaveQueue(operationId)
        }
    }

    /**
     * Enter the wait queue
     */
    async enterQueue(operationId: string, priority: number = 0): Promise<void> {
        // Score = timestamp - (priority * 1000000) 
        // Lower score = earlier position, higher priority = lower score
        const score = Date.now() - (priority * 1_000_000)
        await this.redis.zadd(QUEUE_KEY, score, operationId)
    }

    /**
     * Leave the queue (cleanup)
     */
    async leaveQueue(operationId: string): Promise<void> {
        await this.redis.zrem(QUEUE_KEY, operationId)
    }

    /**
     * Get queue position (1-based, 0 if not in queue)
     */
    async getQueuePosition(operationId: string): Promise<number> {
        const rank = await this.redis.zrank(QUEUE_KEY, operationId)
        return rank !== null ? rank + 1 : 0
    }

    /**
     * Get total queue length
     */
    async getQueueLength(): Promise<number> {
        return await this.redis.zcard(QUEUE_KEY)
    }

    /**
     * Get all operations in queue
     */
    async getQueueEntries(): Promise<string[]> {
        return await this.redis.zrange(QUEUE_KEY, 0, -1)
    }

    /**
     * Check if operation was cancelled
     */
    private async isOperationCancelled(operationId: string): Promise<boolean> {
        try {
            const { prisma } = await import('../lib/prisma')
            const op = await prisma.operation.findUnique({
                where: { id: operationId },
                select: { status: true }
            })
            return op?.status === 'CANCELLED' || op?.status === 'EXPIRED'
        } catch {
            return false
        }
    }

    /**
     * Clean stale queue entries (operations that no longer exist or are completed)
     */
    async cleanStaleEntries(): Promise<number> {
        const entries = await this.getQueueEntries()
        const { prisma } = await import('../lib/prisma')
        
        let removed = 0
        for (const operationId of entries) {
            const op = await prisma.operation.findUnique({
                where: { id: operationId },
                select: { status: true }
            })

            // Remove if operation doesn't exist or is in terminal state
            if (!op || ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(op.status)) {
                await this.leaveQueue(operationId)
                removed++
            }
        }

        if (removed > 0) {
            console.log(`[Queue] Cleaned ${removed} stale entries from queue`)
        }
        return removed
    }

    /**
     * Get queue status
     */
    async getQueueStatus(): Promise<{
        length: number
        entries: Array<{ operationId: string; position: number }>
    }> {
        const entries = await this.getQueueEntries()
        return {
            length: entries.length,
            entries: entries.map((operationId, index) => ({
                operationId,
                position: index + 1
            }))
        }
    }

    /**
     * Sleep helper
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}

// Singleton instance
let queueManagerInstance: AccountQueueManager | null = null

export function getQueueManager(poolManager: AccountPoolManager, redisUrl?: string): AccountQueueManager {
    if (!queueManagerInstance) {
        queueManagerInstance = new AccountQueueManager(poolManager, redisUrl)
    }
    return queueManagerInstance
}
