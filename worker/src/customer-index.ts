/**
 * beIN Panel Customer Worker - Entry Point for Mobile App Operations
 * 
 * This worker processes customer (mobile app) jobs from the customer-operations queue.
 * It uses accounts marked with customerOnly=true, isolating mobile app traffic from resellers.
 * 
 * Key Differences from Main Worker:
 * - Listens to 'customer-operations' queue instead of 'operations'
 * - Uses only accounts with customerOnly=true
 * - Lower concurrency and rate limits (mobile app traffic is less critical)
 * - Separate from reseller operations for complete isolation
 */

// IMPORTANT: Skip TLS verification for Bright Data proxy (self-signed certs)
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
const WORKER_ID = process.env.WORKER_ID || `customer-worker-${process.pid}`
// Lower concurrency for customer operations (less critical than resellers)
const WORKER_CONCURRENCY = parseInt(process.env.CUSTOMER_WORKER_CONCURRENCY || '2')
const WORKER_RATE_LIMIT = parseInt(process.env.CUSTOMER_WORKER_RATE_LIMIT || '20')

// Get shared Redis connection
const connection = getRedisConnection(REDIS_URL)

let accountPool: AccountPoolManager | null = null

async function main() {
    console.log('='.repeat(60))
    console.log('beIN Customer Worker Starting...')
    console.log('='.repeat(60))
    console.log(`Connecting to Redis: ${REDIS_URL.replace(/\/\/.*@/, '//<credentials>@')}`)
    console.log(`Worker ID: ${WORKER_ID}`)
    console.log(`Concurrency: ${WORKER_CONCURRENCY}, Rate Limit: ${WORKER_RATE_LIMIT}/min`)
    console.log(`Mode: HTTP Client (Fast Mode) - Customer Only`)
    console.log(`Queue: customer-operations (isolated from reseller operations)`)
    console.log('')

    // Initialize Account Pool Manager with customerOnly filter
    // The pool manager will be configured to only use customerOnly=true accounts
    accountPool = await initializePoolManager(REDIS_URL, WORKER_ID, { customerOnly: true })
    console.log('Account Pool Manager initialized (customerOnly=true)')

    // Get pool status for customer accounts only
    const poolStatus = await accountPool.getPoolStatus()
    console.log(`Pool Status: ${poolStatus.availableNow}/${poolStatus.activeAccounts} customer accounts available`)

    if (poolStatus.activeAccounts === 0) {
        console.warn('⚠️ WARNING: No customer-only accounts available!')
        console.warn('⚠️ Mark some beIN accounts as "للتطبيق فقط" in the admin panel.')
    }

    // Create worker for customer-operations queue
    const worker = new Worker(
        'customer-operations',  // Different queue name for isolation
        async (job) => {
            console.log(`[${WORKER_ID}] Processing customer job ${job.id}: ${job.data.type}`)
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
        console.log(`[${WORKER_ID}] Customer job ${job.id} completed successfully`)
    })

    worker.on('failed', (job, err) => {
        console.error(`[${WORKER_ID}] Customer job ${job?.id} failed:`, err.message)
    })

    worker.on('error', (err) => {
        console.error(`[${WORKER_ID}] Customer worker error:`, err)
    })

    console.log(`[${WORKER_ID}] Customer worker is now processing jobs...`)

    // Graceful shutdown
    const shutdown = async () => {
        console.log(`\n[${WORKER_ID}] Shutting down customer worker...`)

        await worker.close()

        // Cleanup HTTP clients
        closeAllHttpClients()

        if (accountPool) {
            await accountPool.close()
        }
        // Close shared Redis connection last
        await closeRedisConnection()
        console.log(`[${WORKER_ID}] Customer worker stopped`)
        process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
}

main().catch((err) => {
    console.error('Fatal error in customer worker:', err)
    process.exit(1)
})
