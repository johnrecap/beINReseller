/**
 * beIN Panel Worker - Main Entry Point
 * 
 * This worker processes automation jobs from the BullMQ queue.
 * 
 * HTTP Mode:
 * - Uses direct HTTP requests via Axios (fast, lightweight)
 * - Session caching in Redis for persistence across workers
 * - Keep-alive service to maintain sessions
 * 
 * Multi-Account Support:
 * - Uses AccountPoolManager for smart distribution
 * - Supports multiple workers with account locking
 * - Round Robin with rate limiting per account
 */

// IMPORTANT: Skip TLS verification for Bright Data proxy (self-signed certs)
// This MUST be set before any https connections are made
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import 'dotenv/config'
import { Worker } from 'bullmq'
import { processOperationHttp, closeAllHttpClients, getHttpClientsMap } from './http-queue-processor'
import { initializePoolManager, AccountPoolManager } from './pool'
import { SessionKeepAlive } from './utils/session-keepalive'
import { getRedisConnection, closeRedisConnection } from './lib/redis'

// Validate environment
const requiredEnvVars = ['DATABASE_URL', 'REDIS_URL']
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`Missing required environment variable: ${envVar}`)
        process.exit(1)
    }
}

const REDIS_URL = process.env.REDIS_URL!
const WORKER_ID = process.env.WORKER_ID || `worker-${process.pid}`
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '3')
const WORKER_RATE_LIMIT = parseInt(process.env.WORKER_RATE_LIMIT || '30')

// Get shared Redis connection
const connection = getRedisConnection(REDIS_URL)

let accountPool: AccountPoolManager | null = null
let sessionKeepAlive: SessionKeepAlive | null = null

// Keep-alive configuration (10 minutes default)
const KEEPALIVE_INTERVAL_MS = parseInt(process.env.WORKER_KEEPALIVE_INTERVAL || '600000')

async function main() {
    console.log('beIN Worker Starting...')
    console.log(`Connecting to Redis: ${REDIS_URL.replace(/\/\/.*@/, '//<credentials>@')}`)
    console.log(`Worker ID: ${WORKER_ID}`)
    console.log(`Concurrency: ${WORKER_CONCURRENCY}, Rate Limit: ${WORKER_RATE_LIMIT}/min`)
    console.log(`Mode: HTTP Client (Fast Mode)`)

    // Initialize Account Pool Manager (uses shared Redis connection)
    accountPool = await initializePoolManager(REDIS_URL, WORKER_ID)
    console.log('Account Pool Manager initialized')

    // Get pool status
    const poolStatus = await accountPool.getPoolStatus()
    console.log(`Pool Status: ${poolStatus.availableNow}/${poolStatus.activeAccounts} accounts available`)

    // Create session keep-alive for HTTP mode (with worker ID for distributed locking)
    const httpClients = getHttpClientsMap()
    sessionKeepAlive = new SessionKeepAlive(httpClients, WORKER_ID)
    
    // ============================================
    // PRE-LOGIN ALL ACCOUNTS before processing jobs
    // This ensures all accounts are "warm" and ready for instant operations
    // Timeout: 2 minutes max to prevent blocking worker startup
    // ============================================
    const PRE_LOGIN_TIMEOUT_MS = parseInt(process.env.PRE_LOGIN_TIMEOUT || '120000') // 2 minutes default
    
    console.log('Pre-logging all beIN accounts (this may take a moment)...')
    const preLoginStartTime = Date.now()
    
    try {
        // Wrap pre-login in a timeout to prevent infinite hang
        const preLoginPromise = sessionKeepAlive.preLoginAllAccounts()
        const timeoutPromise = new Promise<{ success: number; failed: number; captcha: number; skipped: number }>((_, reject) => {
            setTimeout(() => reject(new Error('Pre-login timeout')), PRE_LOGIN_TIMEOUT_MS)
        })
        
        const preLoginResult = await Promise.race([preLoginPromise, timeoutPromise])
        const preLoginDuration = Math.round((Date.now() - preLoginStartTime) / 1000)
        console.log(`Pre-login complete in ${preLoginDuration}s: ${preLoginResult.success} warm, ${preLoginResult.failed} cold`)
    } catch (preLoginError: any) {
        const preLoginDuration = Math.round((Date.now() - preLoginStartTime) / 1000)
        console.warn(`Pre-login failed or timed out after ${preLoginDuration}s: ${preLoginError.message}`)
        console.warn('Worker will continue - accounts will login on first operation')
    }
    
    // Start keep-alive AFTER pre-login (runs even if pre-login failed)
    sessionKeepAlive.start(KEEPALIVE_INTERVAL_MS)
    console.log(`Session Keep-Alive started (${Math.floor(KEEPALIVE_INTERVAL_MS / 60000)} min interval)`)

    // Create worker with increased concurrency and rate limit
    const worker = new Worker(
        'operations',
        async (job) => {
            console.log(`[${WORKER_ID}] Processing job ${job.id}: ${job.data.type}`)
            return processOperationHttp(job, accountPool!)
        },
        {
            connection: connection as any,
            concurrency: WORKER_CONCURRENCY,
            limiter: {
                max: WORKER_RATE_LIMIT,
                duration: 60000, // per minute
            },
        }
    )

    worker.on('completed', (job) => {
        console.log(`[${WORKER_ID}] Job ${job.id} completed successfully`)
    })

    worker.on('failed', (job, err) => {
        console.error(`[${WORKER_ID}] Job ${job?.id} failed:`, err.message)
    })

    worker.on('error', (err) => {
        console.error(`[${WORKER_ID}] Worker error:`, err)
    })

    console.log(`[${WORKER_ID}] Worker is now processing jobs...`)

    // Graceful shutdown
    const shutdown = async () => {
        console.log(`\n[${WORKER_ID}] Shutting down worker...`)

        // Stop session keep-alive
        if (sessionKeepAlive) {
            sessionKeepAlive.stop()
        }

        await worker.close()

        // Cleanup HTTP clients
        closeAllHttpClients()

        if (accountPool) {
            await accountPool.close()
        }
        // Close shared Redis connection last
        await closeRedisConnection()
        console.log(`[${WORKER_ID}] Worker stopped`)
        process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
}

main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})
