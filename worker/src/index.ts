/**
 * beIN Panel Worker - Main Entry Point
 * 
 * This worker processes automation jobs from the BullMQ queue.
 * It uses Playwright to interact with the beIN management portal.
 */

import 'dotenv/config'
import { Worker } from 'bullmq'
import Redis from 'ioredis'
import { BeINAutomation } from './automation/bein-automation'
import { processOperation } from './queue-processor'

// Validate environment
const requiredEnvVars = ['DATABASE_URL', 'REDIS_URL']
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`❌ Missing required environment variable: ${envVar}`)
        process.exit(1)
    }
}

const REDIS_URL = process.env.REDIS_URL!
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null }) as any

let automation: BeINAutomation | null = null

async function main() {
    console.log('🚀 beIN Worker Starting...')
    console.log(`📡 Connecting to Redis: ${REDIS_URL.replace(/\/\/.*@/, '//<credentials>@')}`)

    // Initialize automation instance
    automation = new BeINAutomation()
    await automation.initialize()
    console.log('🌐 Browser initialized')

    // Create worker
    const worker = new Worker(
        'operations',
        async (job) => {
            console.log(`📥 Processing job ${job.id}: ${job.data.type}`)
            return processOperation(job, automation!)
        },
        {
            connection,
            concurrency: parseInt(process.env.WORKER_CONCURRENCY || '1'),
            limiter: {
                max: 10,
                duration: 60000, // 10 jobs per minute max
            },
        }
    )

    worker.on('completed', (job) => {
        console.log(`✅ Job ${job.id} completed successfully`)
    })

    worker.on('failed', (job, err) => {
        console.error(`❌ Job ${job?.id} failed:`, err.message)
    })

    worker.on('error', (err) => {
        console.error('❌ Worker error:', err)
    })

    console.log('👷 Worker is now processing jobs...')

    // Graceful shutdown
    const shutdown = async () => {
        console.log('\n🛑 Shutting down worker...')
        await worker.close()
        if (automation) {
            await automation.close()
        }
        await connection.quit()
        console.log('👋 Worker stopped')
        process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
}

main().catch((err) => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
