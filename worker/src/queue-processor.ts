/**
 * Queue Processor - Handles individual operation jobs
 * 
 * Features:
 * - Multi-account support via AccountPoolManager
 * - Wizard flow (START_RENEWAL, COMPLETE_PURCHASE)
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
    type: 'RENEW' | 'CHECK_BALANCE' | 'REFRESH_SIGNAL' | 'START_RENEWAL' | 'COMPLETE_PURCHASE' | 'APPLY_PROMO' | 'CONFIRM_PURCHASE' | 'CANCEL_CONFIRM'
    cardNumber: string
    duration?: string
    promoCode?: string
    userId?: string
    amount?: number
}

// Custom error for cancelled operations
class OperationCancelledError extends Error {
    constructor(operationId: string) {
        super(`Operation ${operationId} was cancelled`)
        this.name = 'OperationCancelledError'
    }
}

/**
 * Check if operation was cancelled - call this before critical steps
 */
async function checkIfCancelled(operationId: string): Promise<void> {
    const op = await prisma.operation.findUnique({
        where: { id: operationId },
        select: { status: true }
    })

    if (op?.status === 'CANCELLED') {
        console.log(`🚫 Operation ${operationId} was cancelled - stopping processing`)
        throw new OperationCancelledError(operationId)
    }
}


const CAPTCHA_TIMEOUT_MS = parseInt(process.env.CAPTCHA_TIMEOUT || '120') * 1000

export async function processOperation(
    job: Job<OperationJobData>,
    automation: BeINAutomation,
    accountPool: AccountPoolManager
): Promise<void> {
    const { operationId, type, cardNumber, duration, promoCode, userId, amount } = job.data
    let selectedAccountId: string | null = null

    console.log(`📥 Processing operation ${operationId}: ${type} for card ${cardNumber.slice(0, 4)}****`)

    // Reload config to get latest settings from database
    await automation.reloadConfig()

    try {
        // Handle Wizard flow types
        if (type === 'START_RENEWAL') {
            await handleStartRenewal(operationId, cardNumber, automation, accountPool)
            return
        }

        if (type === 'COMPLETE_PURCHASE') {
            await handleCompletePurchase(operationId, promoCode, automation, accountPool)
            return
        }

        if (type === 'APPLY_PROMO') {
            await handleApplyPromo(operationId, promoCode || '', automation, accountPool)
            return
        }

        if (type === 'CONFIRM_PURCHASE') {
            await handleConfirmPurchase(operationId, automation, accountPool)
            return
        }

        if (type === 'CANCEL_CONFIRM') {
            await handleCancelConfirm(operationId, automation, accountPool)
            return
        }

        // Original flow for legacy operations
        await handleLegacyOperation(job, automation, accountPool)

    } catch (error: any) {
        // ===== CRITICAL: Don't retry cancelled operations =====
        if (error instanceof OperationCancelledError) {
            console.log(`🚫 Operation ${operationId} was cancelled - not retrying`)
            // Don't throw, don't refund - operation was intentionally cancelled
            return
        }

        console.error(`❌ Operation ${operationId} failed:`, error.message)

        // For Wizard operations, fetch userId and amount from database since they're not in job data
        let opUserId = userId
        let opAmount = amount

        if (!opUserId || !opAmount) {
            const op = await prisma.operation.findUnique({
                where: { id: operationId },
                select: { userId: true, amount: true, beinAccountId: true }
            })
            opUserId = opUserId || op?.userId
            opAmount = opAmount || op?.amount
            selectedAccountId = op?.beinAccountId || selectedAccountId
        }

        await handleOperationError(operationId, error, selectedAccountId, opUserId, opAmount, accountPool)
    }
}

/**
 * Handle START_RENEWAL - Wizard Step 1
 * - Login to beIN
 * - Navigate to packages page
 * - Extract available packages
 * - Save to operation.availablePackages
 * - Set status to AWAITING_PACKAGE
 */
async function handleStartRenewal(
    operationId: string,
    cardNumber: string,
    automation: BeINAutomation,
    accountPool: AccountPoolManager
): Promise<void> {
    console.log(`🚀 Starting renewal wizard for operation ${operationId}`)

    // Check if operation was cancelled before starting
    await checkIfCancelled(operationId)

    // 0. Get operation with userId for notifications
    const operation = await prisma.operation.findUnique({
        where: { id: operationId },
        select: { userId: true }
    })

    const userId = operation?.userId

    // 1. Mark as PROCESSING
    await prisma.operation.update({
        where: { id: operationId },
        data: { status: 'PROCESSING' }
    })

    // 2. Get next available account
    const selectedAccount = await accountPool.getNextAvailableAccount()
    if (!selectedAccount) {
        throw new Error('NO_AVAILABLE_ACCOUNTS: لا توجد حسابات متاحة حالياً')
    }

    // Link account to operation
    await prisma.operation.update({
        where: { id: operationId },
        data: { beinAccountId: selectedAccount.id }
    })

    console.log(`🔑 Using account: ${selectedAccount.label || selectedAccount.username}`)

    // 3. Apply delay for human-like behavior
    const delay = accountPool.getRandomDelay()
    await new Promise(resolve => setTimeout(resolve, delay))

    // Check cancellation before login
    await checkIfCancelled(operationId)

    // 4. Ensure login
    const loginResult = await automation.ensureLoginWithAccount(selectedAccount)

    if (loginResult.requiresCaptcha && loginResult.captchaImage) {
        console.log(`🧩 Operation ${operationId} requires CAPTCHA`)

        // Update with captcha
        await prisma.operation.update({
            where: { id: operationId },
            data: {
                status: 'AWAITING_CAPTCHA',
                captchaImage: loginResult.captchaImage,
                captchaExpiry: new Date(Date.now() + CAPTCHA_TIMEOUT_MS)
            }
        })

        // Wait for captcha solution
        const solution = await waitForCaptchaSolution(operationId)
        if (!solution) {
            throw new Error('CAPTCHA_TIMEOUT: لم يتم إدخال كود التحقق')
        }

        await automation.completeCaptchaForAccount(selectedAccount.id, solution, selectedAccount.totpSecret || undefined)
    }

    // Check cancellation after login/captcha
    await checkIfCancelled(operationId)

    // 5. Navigate and extract packages
    const packages = await automation.startRenewalSession(selectedAccount.id, cardNumber)
    const stbNumber = await automation.extractSTBNumber(selectedAccount.id)

    // 6. Update operation with packages
    await prisma.operation.update({
        where: { id: operationId },
        data: {
            status: 'AWAITING_PACKAGE',
            stbNumber: stbNumber,
            availablePackages: packages,
            captchaImage: null,
            captchaSolution: null,
            captchaExpiry: null
        }
    })

    console.log(`✅ Packages extracted for ${operationId}: ${packages.length} packages`)
}

/**
 * Handle COMPLETE_PURCHASE - Wizard Step 2
 * - Select the package
 * - Apply promo code if provided
 * - Enter STB in popup
 * - PAUSE and wait for user confirmation
 */
async function handleCompletePurchase(
    operationId: string,
    promoCode: string | undefined,
    automation: BeINAutomation,
    accountPool: AccountPoolManager
): Promise<void> {
    console.log(`💳 Completing purchase for operation ${operationId}`)

    // Check if operation was cancelled before starting
    await checkIfCancelled(operationId)

    // 1. Get operation with package info
    const operation = await prisma.operation.findUnique({
        where: { id: operationId },
        select: {
            id: true,
            userId: true,
            beinAccountId: true,
            selectedPackage: true,
            promoCode: true,
            stbNumber: true,
            amount: true
        }
    })

    if (!operation) {
        throw new Error('Operation not found')
    }

    if (!operation.beinAccountId) {
        throw new Error('No beIN account assigned')
    }

    // Update to COMPLETING
    await prisma.operation.update({
        where: { id: operationId },
        data: { status: 'COMPLETING' }
    })

    // 2. Complete the purchase (with skipFinalClick=true to pause before Ok)
    const selectedPackage = operation.selectedPackage as { index: number; name: string; price: number; checkboxSelector: string } | null
    if (!selectedPackage) {
        throw new Error('No package selected')
    }

    const result = await automation.completePackagePurchase(
        operation.beinAccountId,
        selectedPackage,
        operation.promoCode || promoCode,
        operation.stbNumber || '',
        true  // skipFinalClick = true - pause before clicking Ok
    )

    // 3. Check if awaiting user confirmation
    if (result.awaitingConfirm) {
        console.log(`⏸️ Operation ${operationId} ready for final confirmation`)
        console.log(`   Package: ${selectedPackage.name}`)
        console.log(`   Price: ${selectedPackage.price} USD`)

        // Update status to AWAITING_FINAL_CONFIRM with 2 min timeout
        await prisma.operation.update({
            where: { id: operationId },
            data: {
                status: 'AWAITING_FINAL_CONFIRM',
                finalConfirmExpiry: new Date(Date.now() + 120000), // 2 minutes
                responseMessage: result.message
            }
        })

        // Notify user to confirm
        if (operation.userId) {
            await createNotification({
                userId: operation.userId,
                title: '⚠️ تأكيد الدفع مطلوب',
                message: `${selectedPackage.name} - ${selectedPackage.price} USD - اضغط لتأكيد الدفع`,
                type: 'warning',
                link: '/dashboard/operations'
            })
        }

        console.log(`⏳ Waiting for user confirmation...`)
        return // Exit - will be resumed by CONFIRM_PURCHASE job
    }

    // 4. If not awaiting (shouldn't happen with skipFinalClick=true), handle result
    if (result.success) {
        await prisma.operation.update({
            where: { id: operationId },
            data: {
                status: 'COMPLETED',
                responseMessage: result.message,
                completedAt: new Date()
            }
        })

        // Mark account as used
        await accountPool.markAccountUsed(operation.beinAccountId)

        // Notify success
        if (operation.userId) {
            await createNotification({
                userId: operation.userId,
                title: 'تم التجديد بنجاح',
                message: `${selectedPackage.name} - ${result.message}`,
                type: 'success',
                link: '/dashboard/history'
            })
        }

        console.log(`✅ Purchase completed for ${operationId}: ${result.message}`)
    } else {
        // Refund and mark failed
        if (operation.userId && operation.amount) {
            await refundUser(operationId, operation.userId, operation.amount, result.message)
        }

        await markOperationFailed(operationId, { type: 'UNKNOWN', message: result.message, recoverable: false }, 1)

        throw new Error(result.message)
    }
}

/**
 * Handle CONFIRM_PURCHASE - Final step after user confirmation
 * - Click "Ok" button in STB popup
 * - Complete the purchase
 */
async function handleConfirmPurchase(
    operationId: string,
    automation: BeINAutomation,
    accountPool: AccountPoolManager
): Promise<void> {
    console.log(`✅ User confirmed - completing purchase for operation ${operationId}`)

    // Check if operation was cancelled
    await checkIfCancelled(operationId)

    // 1. Get operation
    const operation = await prisma.operation.findUnique({
        where: { id: operationId },
        select: {
            id: true,
            userId: true,
            beinAccountId: true,
            selectedPackage: true,
            amount: true,
            status: true,
            finalConfirmExpiry: true
        }
    })

    if (!operation) {
        throw new Error('Operation not found')
    }

    // Validate status
    if (operation.status !== 'AWAITING_FINAL_CONFIRM') {
        throw new Error(`Invalid status: ${operation.status}. Expected AWAITING_FINAL_CONFIRM`)
    }

    if (!operation.beinAccountId) {
        throw new Error('No beIN account assigned')
    }

    // Check if expired
    if (operation.finalConfirmExpiry && new Date() > operation.finalConfirmExpiry) {
        console.log(`⏰ Confirmation expired for operation ${operationId}`)
        if (operation.userId && operation.amount) {
            await refundUser(operationId, operation.userId, operation.amount, 'انتهت مهلة التأكيد')
        }
        await markOperationFailed(operationId, { type: 'TIMEOUT', message: 'انتهت مهلة التأكيد', recoverable: false }, 1)
        throw new Error('انتهت مهلة التأكيد')
    }

    const selectedPackage = operation.selectedPackage as { index: number; name: string; price: number; checkboxSelector: string } | null

    // Update to COMPLETING
    await prisma.operation.update({
        where: { id: operationId },
        data: { status: 'COMPLETING' }
    })

    // 2. Click the final Ok button
    const result = await automation.clickFinalOkButton(
        operation.beinAccountId,
        selectedPackage?.name || ''
    )

    // 3. Update operation based on result
    if (result.success) {
        await prisma.operation.update({
            where: { id: operationId },
            data: {
                status: 'COMPLETED',
                responseMessage: result.message,
                completedAt: new Date(),
                finalConfirmExpiry: null
            }
        })

        // Mark account as used
        await accountPool.markAccountUsed(operation.beinAccountId)

        // Notify success
        if (operation.userId) {
            await createNotification({
                userId: operation.userId,
                title: 'تم التجديد بنجاح',
                message: `${selectedPackage?.name || 'الباقة'} - ${result.message}`,
                type: 'success',
                link: '/dashboard/history'
            })
        }

        console.log(`✅ Purchase confirmed and completed for ${operationId}: ${result.message}`)
    } else {
        // Refund and mark failed
        if (operation.userId && operation.amount) {
            await refundUser(operationId, operation.userId, operation.amount, result.message)
        }

        await markOperationFailed(operationId, { type: 'UNKNOWN', message: result.message, recoverable: false }, 1)

        throw new Error(result.message)
    }
}

/**
 * Handle CANCEL_CONFIRM - Cancel the purchase when user clicks cancel button
 * - Click "Cancel" button in STB popup
 * - Refund user
 * - Mark operation as CANCELLED
 */
async function handleCancelConfirm(
    operationId: string,
    automation: BeINAutomation,
    accountPool: AccountPoolManager
): Promise<void> {
    console.log(`🚫 User cancelled - cancelling purchase for operation ${operationId}`)

    // Check if operation was cancelled
    await checkIfCancelled(operationId)

    // 1. Get operation
    const operation = await prisma.operation.findUnique({
        where: { id: operationId },
        select: {
            id: true,
            userId: true,
            beinAccountId: true,
            selectedPackage: true,
            amount: true,
            status: true,
        }
    })

    if (!operation) {
        throw new Error('Operation not found')
    }

    // Validate status
    if (operation.status !== 'AWAITING_FINAL_CONFIRM') {
        throw new Error(`Invalid status: ${operation.status}. Expected AWAITING_FINAL_CONFIRM`)
    }

    if (!operation.beinAccountId) {
        throw new Error('No beIN account assigned')
    }

    // 2. Click Cancel button in popup
    try {
        await automation.clickCancelInPopup(operation.beinAccountId)
        console.log(`✅ Cancel button clicked in popup`)
    } catch (error: any) {
        console.log(`⚠️ Could not click cancel button: ${error.message}`)
        // Continue anyway - main goal is to cancel the operation
    }

    // 3. Refund user
    if (operation.userId && operation.amount) {
        await prisma.$transaction(async (tx) => {
            // Get current balance
            const user = await tx.user.findUnique({
                where: { id: operation.userId },
                select: { balance: true }
            })

            if (user) {
                const newBalance = user.balance + operation.amount!

                // Update user balance
                await tx.user.update({
                    where: { id: operation.userId },
                    data: { balance: newBalance }
                })

                // Create refund transaction
                await tx.transaction.create({
                    data: {
                        userId: operation.userId,
                        type: 'REFUND',
                        amount: operation.amount!,
                        balanceAfter: newBalance,
                        operationId: operationId,
                        notes: 'استرداد - إلغاء المستخدم قبل التأكيد'
                    }
                })

                console.log(`💰 Refunded ${operation.amount} to user ${operation.userId}`)
            }
        })
    }

    // 4. Mark operation as CANCELLED
    await prisma.operation.update({
        where: { id: operationId },
        data: {
            status: 'CANCELLED',
            responseMessage: 'تم إلغاء العملية بواسطة المستخدم',
            completedAt: new Date(),
            finalConfirmExpiry: null
        }
    })

    // 5. Notify user
    if (operation.userId) {
        await createNotification({
            userId: operation.userId,
            title: 'تم إلغاء العملية',
            message: 'تم إلغاء عملية الشراء واسترداد المبلغ',
            type: 'info',
            link: '/dashboard/history'
        })
    }

    // 6. Mark account usage
    if (operation.beinAccountId) {
        await accountPool.markAccountUsed(operation.beinAccountId)
    }

    console.log(`✅ Operation ${operationId} cancelled and refunded`)
}

/**
 * Handle Apply Promo - Apply promo code on beIN and return updated packages
 */
async function handleApplyPromo(
    operationId: string,
    promoCode: string,
    automation: BeINAutomation,
    accountPool: AccountPoolManager
): Promise<void> {
    console.log(`🎫 Applying promo code ${promoCode} for operation ${operationId}`)

    // Check if operation was cancelled before starting
    await checkIfCancelled(operationId)

    // 1. Get operation
    const operation = await prisma.operation.findUnique({
        where: { id: operationId },
    })

    if (!operation) {
        throw new Error('العملية غير موجودة')
    }

    if (!operation.beinAccountId) {
        throw new Error('لا يوجد حساب beIN مرتبط')
    }

    // 2. Apply promo code on beIN and get updated packages
    const result = await automation.applyPromoAndRefreshPackages(
        operation.beinAccountId,
        operation.cardNumber,
        promoCode
    )

    // 3. Update availablePackages with new prices (IMPORTANT: select-package uses this!)
    await prisma.operation.update({
        where: { id: operationId },
        data: {
            // Update the actual packages array with new prices
            availablePackages: result.packages as unknown as never[],
            // Also save to responseData for API polling
            responseData: JSON.stringify({
                promoApplied: true,
                packages: result.packages || [],
                promoCode,
            }),
        },
    })

    // Mark account as used
    await accountPool.markAccountUsed(operation.beinAccountId)

    console.log(`✅ Promo applied, ${result.packages?.length || 0} packages with updated prices`)
}

/**
 * Handle legacy operation types (RENEW, CHECK_BALANCE, REFRESH_SIGNAL)
 */
async function handleLegacyOperation(
    job: Job<OperationJobData>,
    automation: BeINAutomation,
    accountPool: AccountPoolManager
): Promise<void> {
    const { operationId, type, cardNumber, duration, userId, amount } = job.data
    let selectedAccountId: string | null = null

    // 1. Mark operation as PROCESSING
    await prisma.operation.update({
        where: { id: operationId },
        data: { status: 'PROCESSING' }
    })

    // 2. Get next available account from pool
    const selectedAccount = await accountPool.getNextAvailableAccount()
    if (!selectedAccount) {
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
    await new Promise(resolve => setTimeout(resolve, delay))

    // 4. Ensure we're logged in with the selected account
    const loginResult = await automation.ensureLoginWithAccount(selectedAccount)

    if (loginResult.requiresCaptcha && loginResult.captchaImage) {
        await prisma.operation.update({
            where: { id: operationId },
            data: {
                status: 'AWAITING_CAPTCHA',
                captchaImage: loginResult.captchaImage,
                captchaExpiry: new Date(Date.now() + CAPTCHA_TIMEOUT_MS)
            }
        })

        if (userId) {
            await createNotification({
                userId,
                title: 'مطلوب إدخال كود التحقق',
                message: 'يرجى إدخال كود التحقق لإكمال العملية',
                type: 'warning',
                link: '/dashboard/operations'
            })
        }

        const solution = await waitForCaptchaSolution(operationId)
        if (!solution) {
            throw new Error('CAPTCHA_TIMEOUT: لم يتم إدخال كود التحقق في الوقت المحدد')
        }

        await automation.completeCaptchaForAccount(selectedAccount.id, solution, selectedAccount.totpSecret || undefined)
    }

    // 5. Execute based on type
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
                captchaImage: null,
                captchaSolution: null,
                captchaExpiry: null
            }
        })

        if (selectedAccountId) {
            await accountPool.markAccountUsed(selectedAccountId)
        }

        if (userId) {
            await createNotification({
                userId,
                title: 'تمت العملية بنجاح',
                message: result.message,
                type: 'success',
                link: '/dashboard/history'
            })
        }

        console.log(`✅ Operation ${operationId} completed: ${result.message}`)
    } else {
        throw new Error(result.message)
    }
}

/**
 * Handle operation errors with retry logic
 */
async function handleOperationError(
    operationId: string,
    error: any,
    selectedAccountId: string | null,
    userId?: string,
    amount?: number,
    accountPool?: AccountPoolManager
): Promise<void> {
    if (selectedAccountId && accountPool) {
        await accountPool.markAccountFailed(selectedAccountId, error.message)
    }

    const classifiedError = classifyError(error)
    const isCaptchaTimeout = error.message.includes('CAPTCHA_TIMEOUT')
    const isNoAccounts = error.message.includes('NO_AVAILABLE_ACCOUNTS')

    const operation = await prisma.operation.findUnique({
        where: { id: operationId }
    })

    const retryCount = (operation?.retryCount || 0) + 1
    const maxRetries = 3

    if ((classifiedError.recoverable || isNoAccounts) && retryCount < maxRetries && !isCaptchaTimeout) {
        const nextDelay = calculateDelay(retryCount)

        await prisma.operation.update({
            where: { id: operationId },
            data: {
                retryCount,
                status: 'PENDING',
                responseMessage: `فشل المحاولة ${retryCount}: ${classifiedError.message}`,
                captchaImage: null,
                captchaSolution: null,
                captchaExpiry: null
            }
        })

        console.log(`🔄 Operation ${operationId} will retry (${retryCount}/${maxRetries})`)
        throw error

    } else {
        await markOperationFailed(operationId, classifiedError, retryCount)
        if (userId && amount) {
            await refundUser(operationId, userId, amount, classifiedError.message)
        }

        if (userId) {
            await createNotification({
                userId,
                title: 'فشلت العملية',
                message: classifiedError.message,
                type: 'error',
                link: '/dashboard/history'
            })
        }

        console.log(`💔 Operation ${operationId} permanently failed after ${retryCount} attempts`)
    }
}

async function waitForCaptchaSolution(operationId: string): Promise<string | null> {
    const startTime = Date.now()
    const pollingInterval = 2000

    while (Date.now() - startTime < CAPTCHA_TIMEOUT_MS) {
        const operation = await prisma.operation.findUnique({
            where: { id: operationId },
            select: { captchaSolution: true, status: true }
        })

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
