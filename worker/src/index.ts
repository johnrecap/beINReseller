/**
 * beIN Panel Worker - Main Entry Point
 * 
 * This worker processes automation jobs from the BullMQ queue.
 * 
 * Automation Modes:
 * - Playwright (default): Full browser automation, slower but more compatible
 * - HTTP (USE_HTTP_CLIENT=true): Direct HTTP requests, 5-10x faster
 * 
 * Multi-Account Support:
 * - Uses AccountPoolManager for smart distribution
 * - Supports multiple workers with account locking
 * - Round Robin with rate limiting per account
 * 
 * Session Keep-Alive (HTTP mode):
 * - Background session refresh every 10 minutes
 * - Keeps beIN accounts always logged in
 * - Reduces CAPTCHA requirements
 */

// IMPORTANT: Skip TLS verification for Bright Data proxy (self-signed certs)
// This MUST be set before any https connections are made
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import 'dotenv/config'
import { Worker } from 'bullmq'
import { BeINAutomation } from './automation/bein-automation'
import { processOperation } from './queue-processor'
import { processOperationHttp, closeAllHttpClients, getHttpClientsMap } from './http-queue-processor'
import { initializePoolManager, AccountPoolManager } from './pool'
import { IdleMonitor } from './utils/idle-monitor'
import { SessionKeepAlive } from './utils/session-keepalive'
import { getRedisConnection, closeRedisConnection } from './lib/redis'

// Validate environment
const requiredEnvVars = ['DATABASE_URL', 'REDIS_URL']
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`❌ Missing required environment variable: ${envVar}`)
        process.exit(1)
    }
}

const REDIS_URL = process.env.REDIS_URL!
const WORKER_ID = process.env.WORKER_ID || `worker-${process.pid}`
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '3')
const WORKER_RATE_LIMIT = parseInt(process.env.WORKER_RATE_LIMIT || '30')

// Feature flag for HTTP mode
const USE_HTTP_CLIENT = process.env.USE_HTTP_CLIENT === 'true'

// Get shared Redis connection
const connection = getRedisConnection(REDIS_URL)

let automation: BeINAutomation | null = null
let accountPool: AccountPoolManager | null = null
let idleMonitor: IdleMonitor | null = null
let sessionKeepAlive: SessionKeepAlive | null = null

// Keep-alive configuration (10 minutes default)
const KEEPALIVE_INTERVAL_MS = parseInt(process.env.WORKER_KEEPALIVE_INTERVAL || '600000')

async function main() {
    console.log('🚀 beIN Worker Starting...')
    console.log(`📡 Connecting to Redis: ${REDIS_URL.replace(/\/\/.*@/, '//<credentials>@')}`)
    console.log(`🆔 Worker ID: ${WORKER_ID}`)
    console.log(`⚡ Concurrency: ${WORKER_CONCURRENCY}, Rate Limit: ${WORKER_RATE_LIMIT}/min`)

    // Log automation mode
    if (USE_HTTP_CLIENT) {
        console.log(`🚀 Mode: HTTP Client (Fast Mode) ⚡`)
    } else {
        console.log(`🎭 Mode: Playwright (Browser Mode)`)
    }

    // Initialize Account Pool Manager (uses shared Redis connection)
    accountPool = await initializePoolManager(REDIS_URL, WORKER_ID)
    console.log('🔄 Account Pool Manager initialized')

    // Get pool status
    const poolStatus = await accountPool.getPoolStatus()
    console.log(`📊 Pool Status: ${poolStatus.availableNow}/${poolStatus.activeAccounts} accounts available`)

    // Initialize automation ONLY if using Playwright mode
    if (!USE_HTTP_CLIENT) {
        automation = new BeINAutomation()
        await automation.initialize()
        console.log('🌐 Automation initialized (lazy browser)')

        // Start idle monitor for automatic resource cleanup (Playwright only)
        idleMonitor = new IdleMonitor(
            automation,
            60000,  // Check browser idle every 1 min
            300000  // Cleanup sessions every 5 min
        )
        idleMonitor.start()
    } else {
        console.log('🌐 Using HTTP Client - no browser needed')
        
        // Start session keep-alive for HTTP mode
        // This keeps beIN sessions alive by sending periodic requests
        const httpClients = getHttpClientsMap()
        sessionKeepAlive = new SessionKeepAlive(httpClients)
        sessionKeepAlive.start(KEEPALIVE_INTERVAL_MS)
        console.log(`💓 Session Keep-Alive started (${Math.floor(KEEPALIVE_INTERVAL_MS / 60000)} min interval)`)
    }

    // Create worker with increased concurrency and rate limit
    const worker = new Worker(
        'operations',
        async (job) => {
            console.log(`📥 [${WORKER_ID}] Processing job ${job.id}: ${job.data.type}`)

            if (USE_HTTP_CLIENT) {
                // Use HTTP-based processor
                return processOperationHttp(job, accountPool!)
            } else {
                // Use Playwright-based processor
                return processOperation(job, automation!, accountPool!)
            }
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
        console.log(`✅ [${WORKER_ID}] Job ${job.id} completed successfully`)
    })

    worker.on('failed', (job, err) => {
        console.error(`❌ [${WORKER_ID}] Job ${job?.id} failed:`, err.message)
    })

    worker.on('error', (err) => {
        console.error(`❌ [${WORKER_ID}] Worker error:`, err)
    })

    console.log(`👷 [${WORKER_ID}] Worker is now processing jobs...`)

    // Graceful shutdown
    const shutdown = async () => {
        console.log(`\n🛑 [${WORKER_ID}] Shutting down worker...`)

        // Stop idle monitor first (Playwright mode)
        if (idleMonitor) {
            idleMonitor.stop()
        }

        // Stop session keep-alive (HTTP mode)
        if (sessionKeepAlive) {
            sessionKeepAlive.stop()
        }

        await worker.close()

        // Cleanup based on mode
        if (USE_HTTP_CLIENT) {
            closeAllHttpClients()
        } else if (automation) {
            await automation.close()
        }

        if (accountPool) {
            await accountPool.close()
        }
        // Close shared Redis connection last
        await closeRedisConnection()
        console.log(`👋 [${WORKER_ID}] Worker stopped`)
        process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
}

main().catch((err) => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})


