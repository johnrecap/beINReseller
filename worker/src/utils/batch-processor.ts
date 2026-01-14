/**
 * Batch Processor - Groups similar operations for efficiency
 * 
 * Features:
 * - Collects similar jobs within a time window
 * - Executes them together to reduce page navigation overhead
 * - Configurable batch size and wait time
 * - Only batches CHECK_BALANCE by default (safe read-only operation)
 * 
 * Note: RENEW operations are NOT batched as they are critical write operations
 */

import { Job } from 'bullmq'

interface BatchConfig {
    maxBatchSize: number      // Max jobs per batch
    batchWindowMs: number     // Wait time to collect jobs
    enabledTypes: string[]    // Which job types to batch
}

interface BatchedJob {
    job: Job
    resolve: (result: any) => void
    reject: (error: Error) => void
}

interface PendingBatch {
    jobs: BatchedJob[]
    timeout: NodeJS.Timeout
    createdAt: number
}

export class BatchProcessor {
    private pendingBatches: Map<string, PendingBatch> = new Map()
    private config: BatchConfig
    private stats = {
        totalBatched: 0,
        totalExecuted: 0,
        batchesCreated: 0
    }

    constructor(config?: Partial<BatchConfig>) {
        this.config = {
            maxBatchSize: 5,
            batchWindowMs: 500,
            enabledTypes: ['CHECK_BALANCE'], // Only batch balance checks (safe read-only)
            ...config
        }

        console.log(`📦 BatchProcessor initialized (maxSize: ${this.config.maxBatchSize}, window: ${this.config.batchWindowMs}ms)`)
    }

    /**
     * Check if a job type should be batched
     */
    shouldBatch(jobType: string): boolean {
        return this.config.enabledTypes.includes(jobType)
    }

    /**
     * Add job to batch and return a promise that resolves when batch executes
     */
    async addToBatch<T>(job: Job, executor: (jobs: Job[]) => Promise<Map<string, T>>): Promise<T> {
        const batchKey = this.getBatchKey(job)

        return new Promise<T>((resolve, reject) => {
            let batch = this.pendingBatches.get(batchKey)

            if (!batch) {
                // Create new batch
                batch = {
                    jobs: [],
                    timeout: setTimeout(
                        () => this.executeBatch(batchKey, executor),
                        this.config.batchWindowMs
                    ),
                    createdAt: Date.now()
                }
                this.pendingBatches.set(batchKey, batch)
                this.stats.batchesCreated++
                console.log(`📦 New batch created: ${batchKey}`)
            }

            // Add job to batch
            batch.jobs.push({ job, resolve, reject })
            this.stats.totalBatched++

            console.log(`📦 Job ${job.id} added to batch ${batchKey} (${batch.jobs.length}/${this.config.maxBatchSize})`)

            // Execute immediately if batch is full
            if (batch.jobs.length >= this.config.maxBatchSize) {
                clearTimeout(batch.timeout)
                this.executeBatch(batchKey, executor)
            }
        })
    }

    /**
     * Generate a batch key for grouping similar jobs
     * Jobs with same type and account can be batched together
     */
    private getBatchKey(job: Job): string {
        const type = job.data.type || 'unknown'
        // Group by operation type only (account will be assigned during execution)
        return `batch:${type}`
    }

    /**
     * Execute a batch of jobs
     */
    private async executeBatch<T>(
        batchKey: string,
        executor: (jobs: Job[]) => Promise<Map<string, T>>
    ): Promise<void> {
        const batch = this.pendingBatches.get(batchKey)
        if (!batch || batch.jobs.length === 0) {
            this.pendingBatches.delete(batchKey)
            return
        }

        // Remove from pending
        this.pendingBatches.delete(batchKey)

        const jobs = batch.jobs.map(b => b.job)
        const batchSize = jobs.length
        const waitTime = Date.now() - batch.createdAt

        console.log(`📦 Executing batch ${batchKey}: ${batchSize} jobs (waited ${waitTime}ms)`)

        try {
            // Execute all jobs in batch
            const results = await executor(jobs)
            this.stats.totalExecuted += batchSize

            // Resolve each job with its result
            for (const batchedJob of batch.jobs) {
                const jobId = batchedJob.job.id!
                const result = results.get(jobId)

                if (result !== undefined) {
                    batchedJob.resolve(result)
                } else {
                    batchedJob.reject(new Error(`No result for job ${jobId}`))
                }
            }

            console.log(`✅ Batch ${batchKey} completed: ${batchSize} jobs`)

        } catch (error: any) {
            // Reject all jobs on batch failure
            console.error(`❌ Batch ${batchKey} failed:`, error.message)

            for (const batchedJob of batch.jobs) {
                batchedJob.reject(error)
            }
        }
    }

    /**
     * Get batch statistics
     */
    getStats(): {
        pendingBatches: number
        totalPendingJobs: number
        totalBatched: number
        totalExecuted: number
        batchesCreated: number
    } {
        let totalPendingJobs = 0
        for (const batch of this.pendingBatches.values()) {
            totalPendingJobs += batch.jobs.length
        }

        return {
            pendingBatches: this.pendingBatches.size,
            totalPendingJobs,
            ...this.stats
        }
    }

    /**
     * Clear all pending batches (for shutdown)
     */
    async clearAll(): Promise<void> {
        for (const [key, batch] of this.pendingBatches.entries()) {
            clearTimeout(batch.timeout)

            // Reject all pending jobs
            for (const batchedJob of batch.jobs) {
                batchedJob.reject(new Error('Batch processor shutting down'))
            }

            this.pendingBatches.delete(key)
        }

        console.log('📦 BatchProcessor cleared all pending batches')
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<BatchConfig>): void {
        this.config = { ...this.config, ...config }
        console.log('📦 BatchProcessor config updated:', this.config)
    }

    /**
     * Check if batching is enabled for any type
     */
    isEnabled(): boolean {
        return this.config.enabledTypes.length > 0
    }

    /**
     * Get enabled types
     */
    getEnabledTypes(): string[] {
        return [...this.config.enabledTypes]
    }
}

// Singleton instance
let batchProcessorInstance: BatchProcessor | null = null

export function getBatchProcessor(config?: Partial<BatchConfig>): BatchProcessor {
    if (!batchProcessorInstance) {
        batchProcessorInstance = new BatchProcessor(config)
    }
    return batchProcessorInstance
}

export function closeBatchProcessor(): Promise<void> {
    if (batchProcessorInstance) {
        const instance = batchProcessorInstance
        batchProcessorInstance = null
        return instance.clearAll()
    }
    return Promise.resolve()
}
