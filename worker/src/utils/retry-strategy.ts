/**
 * Retry Strategy - Exponential Backoff
 * 
 * Handles retrying failed operations with intelligent delays.
 */

export interface RetryOptions {
    maxRetries: number
    initialDelayMs: number
    maxDelayMs: number
    backoffMultiplier: number
}

const DEFAULT_OPTIONS: RetryOptions = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
}

export async function withRetry<T>(
    operation: () => Promise<T>,
    options: Partial<RetryOptions> = {}
): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options }

    let lastError: Error = new Error('Unknown error')
    let delay = opts.initialDelayMs

    for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
        try {
            return await operation()
        } catch (error: any) {
            lastError = error

            if (attempt === opts.maxRetries) {
                console.error(`❌ All ${opts.maxRetries} attempts failed`)
                break
            }

            console.log(`⚠️ Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`)

            await sleep(delay)
            delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs)
        }
    }

    throw lastError
}

export function calculateDelay(attempt: number, options: Partial<RetryOptions> = {}): number {
    const opts = { ...DEFAULT_OPTIONS, ...options }
    const delay = opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1)
    return Math.min(delay, opts.maxDelayMs)
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}
