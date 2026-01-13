/**
 * beIN Panel Worker - Main Entry Point
 * 
 * This worker processes automation jobs from the BullMQ queue.
 * It uses Playwright to interact with the beIN management portal.
 * 
 * Multi-Account Support:
 * - Uses AccountPoolManager for smart distribution
 * - Supports multiple workers with account locking
 * - Round Robin with rate limiting per account
 */

import 'dotenv/config'
import { Worker } from 'bullmq'
import Redis from 'ioredis'
import { BeINAutomation } from './automation/bein-automation'
import { processOperation } from './queue-processor'
import { initializePoolManager, AccountPoolManager } from './pool'

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

const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null }) as any

let automation: BeINAutomation | null = null
let accountPool: AccountPoolManager | null = null

async function main() {
    console.log('🚀 beIN Worker Starting...')
    console.log(`📡 Connecting to Redis: ${REDIS_URL.replace(/\/\/.*@/, '//<credentials>@')}`)
    console.log(`🆔 Worker ID: ${WORKER_ID}`)
    console.log(`⚡ Concurrency: ${WORKER_CONCURRENCY}, Rate Limit: ${WORKER_RATE_LIMIT}/min`)

    // Initialize Account Pool Manager
    accountPool = await initializePoolManager(REDIS_URL, WORKER_ID)
    console.log('🔄 Account Pool Manager initialized')

    // Get pool status
    const poolStatus = await accountPool.getPoolStatus()
    console.log(`📊 Pool Status: ${poolStatus.availableNow}/${poolStatus.activeAccounts} accounts available`)

    // Initialize automation instance
    automation = new BeINAutomation()
    await automation.initialize()
    console.log('🌐 Browser initialized')

    // Create worker with increased concurrency and rate limit
    const worker = new Worker(
        'operations',
        async (job) => {
            console.log(`📥 [${WORKER_ID}] Processing job ${job.id}: ${job.data.type}`)
            return processOperation(job, automation!, accountPool!)
        },
        {
            connection,
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
        await worker.close()
        if (automation) {
            await automation.close()
        }
        if (accountPool) {
            await accountPool.close()
        }
        await connection.quit()
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

