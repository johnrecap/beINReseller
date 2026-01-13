/**
 * Queue Processor - Handles individual operation jobs
 * 
 * Features:
 * - Multi-account support via AccountPoolManager
 * - Retry with exponential backoff
 * - Auto-refund on permanent failure
 * - Error classification
 * - Activity logging
 */

import { Job } from 'bullmq'
import { prisma } from './lib/prisma'
import { BeINAutomation } from './automation/bein-automation'
import { AccountPoolManager } from './pool'
import { withRetry, calculateDelay } from './utils/retry-strategy'
import { classifyError, refundUser, markOperationFailed } from './utils/error-handler'
import { createNotification } from './utils/notification'

interface OperationJobData {
    operationId: string
    type: 'RENEW' | 'CHECK_BALANCE' | 'REFRESH_SIGNAL'
    cardNumber: string
    duration?: string
    userId: string
    amount: number
}

const CAPTCHA_TIMEOUT_MS = parseInt(process.env.CAPTCHA_TIMEOUT || '120') * 1000

export async function processOperation(
    job: Job<OperationJobData>,
    automation: BeINAutomation,
    accountPool: AccountPoolManager
): Promise<void> {
    const { operationId, type, cardNumber, duration, userId, amount } = job.data
    let selectedAccountId: string | null = null

    console.log(`📥 Processing operation ${operationId}: ${type} for card ${cardNumber.slice(0, 4)}****`)

    try {
        // 1. Mark operation as PROCESSING
        await prisma.operation.update({
            where: { id: operationId },
            data: { status: 'PROCESSING' }
        })

        // 2. Get next available account from pool
        const selectedAccount = await accountPool.getNextAvailableAccount()
        if (!selectedAccount) {
            // No accounts available - put back in queue for retry
            throw new Error('NO_AVAILABLE_ACCOUNTS: لا توجد حسابات متاحة حالياً')
        }
        selectedAccountId = selectedAccount.id

        // Link operation to the selected account
        await prisma.operation.update({
            where: { id: operationId },
            data: { beinAccountId: selectedAccountId }
        })

        console.log(`🔑 Using account: ${selectedAccount.label || selectedAccount.username}`)

        // 3. Apply random delay for human-like behavior
        const delay = accountPool.getRandomDelay()
        console.log(`⏳ Waiting ${delay}ms before processing...`)
        await new Promise(resolve => setTimeout(resolve, delay))

        // 4. Ensure we're logged in with the selected account
        try {
            const loginResult = await automation.ensureLoginWithAccount(selectedAccount)

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

                // Notify User Action Required
                await createNotification({
                    userId,
                    title: 'مطلوب إدخال كود التحقق',
                    message: 'يرجى إدخال كود التحقق لإكمال العملية',
                    type: 'warning',
                    link: '/dashboard/operations'
                })

                // Wait for solution
                const solution = await waitForCaptchaSolution(operationId)
                if (!solution) {
                    throw new Error('CAPTCHA_TIMEOUT: لم يتم إدخال كود التحقق في الوقت المحدد')
                }

                // Resume login with solution
                await automation.completeCaptchaForAccount(selectedAccount.id, solution)
            }
        } catch (loginError: any) {
            // Rethrow specific errors to be handled by outer catch
            throw loginError
        }

        // 5. Execute based on type (with retry for the actual operation)
        const result = await withRetry(
            async () => {
                switch (type) {
                    case 'RENEW':
                        return automation.renewCardWithAccount(selectedAccount.id, cardNumber, duration!)
                    case 'CHECK_BALANCE':
                        return automation.checkBalanceWithAccount(selectedAccount.id, cardNumber)
                    case 'REFRESH_SIGNAL':
                        return automation.refreshSignalWithAccount(selectedAccount.id, cardNumber)
                    default:
                        throw new Error(`Unknown operation type: ${type}`)
                }
            },
            { maxRetries: 2, initialDelayMs: 3000 }
        )

        // 6. Update operation based on result
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

            // Mark account as successfully used
            if (selectedAccountId) {
                await accountPool.markAccountUsed(selectedAccountId)
            }

            // Notify Success
            await createNotification({
                userId,
                title: 'تمت العملية بنجاح',
                message: result.message,
                type: 'success',
                link: '/dashboard/history'
            })

            console.log(`✅ Operation ${operationId} completed: ${result.message}`)
        } else {
            throw new Error(result.message)
        }

    } catch (error: any) {
        console.error(`❌ Operation ${operationId} failed:`, error.message)

        // Mark account as failed if we had one selected
        if (selectedAccountId) {
            await accountPool.markAccountFailed(selectedAccountId, error.message)
        }

        const classifiedError = classifyError(error)
        const isCaptchaTimeout = error.message.includes('CAPTCHA_TIMEOUT')
        const isNoAccounts = error.message.includes('NO_AVAILABLE_ACCOUNTS')

        // Get current retry count
        const operation = await prisma.operation.findUnique({
            where: { id: operationId }
        })

        const retryCount = (operation?.retryCount || 0) + 1
        const maxRetries = 3

        // Retry if recoverable error (not CAPTCHA timeout)
        // For NO_AVAILABLE_ACCOUNTS, we should retry (accounts may become available)
        if ((classifiedError.recoverable || isNoAccounts) && retryCount < maxRetries && !isCaptchaTimeout) {
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

            // Notify Failure
            await createNotification({
                userId,
                title: 'فشلت العملية',
                message: classifiedError.message,
                type: 'error',
                link: '/dashboard/history'
            })

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

