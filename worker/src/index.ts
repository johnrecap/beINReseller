/**
 * beIN Panel Worker - Main Entry Point
 * 
 * This worker processes automation jobs from the BullMQ queue.
 * 
 * HTTP Mode:
 * - Uses direct HTTP requests via Axios (fast, lightweight)
 * - Session caching in Redis for persistence across workers
 * 
 * Multi-Account Support:
 * - Uses AccountPoolManager for smart distribution
 * - Supports multiple workers with account locking
 * - Round Robin with rate limiting per account
 * 
 * NOTE: Session keep-alive is handled by the separate bein-keepalive process.
 * Workers do NOT run their own keep-alive to avoid duplication.
 */

// IMPORTANT: Skip TLS verification for Bright Data proxy (self-signed certs)
// This MUST be set before any https connections are made
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import 'dotenv/config'
import { Worker } from 'bullmq'
import { processOperationHttp, closeAllHttpClients } from './http-queue-processor'
import { initializePoolManager, AccountPoolManager } from './pool'
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

async function main() {
    console.log('beIN Worker Starting...')
    console.log(`Connecting to Redis: ${REDIS_URL.replace(/\/\/.*@/, '//<credentials>@')}`)
    console.log(`Worker ID: ${WORKER_ID}`)
    console.log(`Concurrency: ${WORKER_CONCURRENCY}, Rate Limit: ${WORKER_RATE_LIMIT}/min`)
    console.log(`Mode: HTTP Client (Fast Mode)`)
    console.log(`Keep-Alive: Handled by bein-keepalive process (workers do not run keep-alive)`)

    // Initialize Account Pool Manager (uses shared Redis connection)
    accountPool = await initializePoolManager(REDIS_URL, WORKER_ID)
    console.log('Account Pool Manager initialized')

    // Get pool status
    const poolStatus = await accountPool.getPoolStatus()
    console.log(`Pool Status: ${poolStatus.availableNow}/${poolStatus.activeAccounts} accounts available`)

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
