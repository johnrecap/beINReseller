/**
 * Queue Processor - Handles individual operation jobs
 * 
 * Features:
 * - Retry with exponential backoff
 * - Auto-refund on permanent failure
 * - Error classification
 * - Activity logging
 */

import 'dotenv/config'

import { Job } from 'bullmq'
import { PrismaClient } from '../node_modules/@prisma/client'
import { BeINAutomation } from './automation/bein-automation'
import { withRetry, calculateDelay } from './utils/retry-strategy'
import { classifyError, refundUser, markOperationFailed } from './utils/error-handler'

const prisma = new PrismaClient()

interface OperationJobData {
    operationId: string
    type: 'RENEW' | 'CHECK_BALANCE' | 'REFRESH_SIGNAL'
    cardNumber: string
    duration?: string
    userId: string
    amount: number
}

const CAPTCHA_TIMEOUT_MS = 120 * 1000 // 2 minutes

export async function processOperation(job: Job<OperationJobData>, automation: BeINAutomation): Promise<void> {
    const { operationId, type, cardNumber, duration, userId, amount } = job.data

    console.log(`📥 Processing operation ${operationId}: ${type} for card ${cardNumber.slice(0, 4)}****`)

    try {
        // 1. Mark operation as PROCESSING
        await prisma.operation.update({
            where: { id: operationId },
            data: { status: 'PROCESSING' }
        })

        // 2. Ensure we're logged in (with manual CAPTCHA support)
        // We cannot use withRetry here for the full login flow if it involves manual interaction
        // So we handle the login directly
        try {
            const loginResult = await automation.ensureLogin()

            if (loginResult.requiresCaptcha && loginResult.captchaImage) {
                console.log(`🧩 Operation ${operationId} requires manual CAPTCHA`)

                // Update status to AWAITING_CAPTCHA
                await prisma.operation.update({
                    where: { id: operationId },
                    data: {
                        status: 'AWAITING_CAPTCHA',
                        captchaImage: loginResult.captchaImage,
                        captchaExpiry: new Date(Date.now() + CAPTCHA_TIMEOUT_MS)
                    }
                })

                // Wait for solution
                const solution = await waitForCaptchaSolution(operationId)
                if (!solution) {
                    throw new Error('CAPTCHA_TIMEOUT: لم يتم إدخال كود التحقق في الوقت المحدد')
                }

                // Resume login with solution
                await automation.completeCaptcha(solution)
            }
        } catch (loginError: any) {
            // Rethrow specific errors to be handled by outer catch
            throw loginError
        }

        // 3. Execute based on type (with retry for the actual operation)
        const result = await withRetry(
            async () => {
                switch (type) {
                    case 'RENEW':
                        return automation.renewCard(cardNumber, duration!)
                    case 'CHECK_BALANCE':
                        return automation.checkBalance(cardNumber)
                    case 'REFRESH_SIGNAL':
                        return automation.refreshSignal(cardNumber)
                    default:
                        throw new Error(`Unknown operation type: ${type}`)
                }
            },
            { maxRetries: 2, initialDelayMs: 3000 }
        )

        // 4. Update operation based on result
        if (result.success) {
            await prisma.operation.update({
                where: { id: operationId },
                data: {
                    status: 'COMPLETED',
                    responseMessage: result.message,
                    completedAt: new Date(),
                    // Clear captcha fields
                    captchaImage: null,
                    captchaSolution: null,
                    captchaExpiry: null
                }
            })
            console.log(`✅ Operation ${operationId} completed: ${result.message}`)
        } else {
            throw new Error(result.message)
        }

    } catch (error: any) {
        console.error(`❌ Operation ${operationId} failed:`, error.message)

        const classifiedError = classifyError(error)
        const isCaptchaTimeout = error.message.includes('CAPTCHA_TIMEOUT')

        // Get current retry count
        const operation = await prisma.operation.findUnique({
            where: { id: operationId }
        })

        const retryCount = (operation?.retryCount || 0) + 1
        const maxRetries = 3

        // Don't retry on CAPTCHA timeout
        if (classifiedError.recoverable && retryCount < maxRetries && !isCaptchaTimeout) {
            // Update retry count and schedule for retry
            const nextDelay = calculateDelay(retryCount)

            await prisma.operation.update({
                where: { id: operationId },
                data: {
                    retryCount,
                    status: 'PENDING',
                    responseMessage: `فشل المحاولة ${retryCount}: ${classifiedError.message}. إعادة المحاولة بعد ${Math.round(nextDelay / 1000)} ثانية`,
                    // Reseting captcha fields
                    captchaImage: null,
                    captchaSolution: null,
                    captchaExpiry: null
                }
            })

            console.log(`🔄 Operation ${operationId} will retry (${retryCount}/${maxRetries})`)

            // Re-throw to trigger BullMQ retry
            throw error

        } else {
            // Permanent failure - mark as failed and refund
            await markOperationFailed(operationId, classifiedError, retryCount)
            await refundUser(operationId, userId, amount, classifiedError.message)

            console.log(`💔 Operation ${operationId} permanently failed after ${retryCount} attempts`)
        }
    }
}

async function waitForCaptchaSolution(operationId: string): Promise<string | null> {
    const startTime = Date.now()
    const pollingInterval = 2000 // 2 seconds

    while (Date.now() - startTime < CAPTCHA_TIMEOUT_MS) {
        const operation = await prisma.operation.findUnique({
            where: { id: operationId },
            select: { captchaSolution: true, status: true }
        })

        // If cancelled or failed externally
        if (!operation || ['FAILED', 'CANCELLED'].includes(operation.status)) {
            return null
        }

        if (operation.captchaSolution) {
            return operation.captchaSolution
        }

        await new Promise(resolve => setTimeout(resolve, pollingInterval))
    }

    return null
}
