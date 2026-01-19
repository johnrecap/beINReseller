/**
 * HTTP Queue Processor - Handles operations using HttpClientService
 * 
 * This is a parallel implementation to queue-processor.ts that uses
 * direct HTTP requests instead of Playwright for better performance.
 * 
 * @see queue-processor.ts for the Playwright version
 */

import { Job } from 'bullmq';
import { prisma } from './lib/prisma';
import { HttpClientService, AvailablePackage } from './http';
import { AccountPoolManager } from './pool';
import { refundUser, markOperationFailed } from './utils/error-handler';
import { createNotification } from './utils/notification';
import { CaptchaSolver } from './utils/captcha-solver';
import { BeinAccount } from '@prisma/client';

interface OperationJobData {
    operationId: string;
    type: 'RENEW' | 'CHECK_BALANCE' | 'REFRESH_SIGNAL' | 'START_RENEWAL' | 'COMPLETE_PURCHASE' | 'APPLY_PROMO' | 'CONFIRM_PURCHASE' | 'CANCEL_CONFIRM';
    cardNumber: string;
    duration?: string;
    promoCode?: string;
    userId?: string;
    amount?: number;
}

// Custom error for cancelled operations
class OperationCancelledError extends Error {
    constructor(operationId: string) {
        super(`Operation ${operationId} was cancelled`);
        this.name = 'OperationCancelledError';
    }
}

// Map to store HTTP clients per account (session persistence)
const httpClients = new Map<string, HttpClientService>();

/**
 * Get or create HTTP client for an account
 */
async function getHttpClient(account: BeinAccount): Promise<HttpClientService> {
    let client = httpClients.get(account.id);

    if (!client) {
        client = new HttpClientService();
        await client.initialize();
        httpClients.set(account.id, client);
    }

    return client;
}

/**
 * Check if operation was cancelled
 */
async function checkIfCancelled(operationId: string): Promise<void> {
    const op = await prisma.operation.findUnique({
        where: { id: operationId },
        select: { status: true }
    });

    if (op?.status === 'CANCELLED') {
        console.log(`🚫 [HTTP] Operation ${operationId} was cancelled`);
        throw new OperationCancelledError(operationId);
    }
}

/**
 * Get 2Captcha API key from database settings
 */
async function getCaptchaApiKey(): Promise<string | null> {
    try {
        const setting = await prisma.setting.findUnique({
            where: { key: 'captcha_2captcha_key' }
        });
        return setting?.value || null;
    } catch (error) {
        console.error('[HTTP] Failed to get CAPTCHA API key:', error);
        return null;
    }
}

const CAPTCHA_TIMEOUT_MS = parseInt(process.env.CAPTCHA_TIMEOUT || '120') * 1000;

/**
 * Main processor for HTTP-based operations
 */
export async function processOperationHttp(
    job: Job<OperationJobData>,
    accountPool: AccountPoolManager
): Promise<void> {
    const { operationId, type, cardNumber, promoCode, userId, amount } = job.data;
    let selectedAccountId: string | null = null;

    console.log(`📥 [HTTP] Processing ${operationId}: ${type}`);

    try {
        switch (type) {
            case 'START_RENEWAL':
                await handleStartRenewalHttp(operationId, cardNumber, accountPool);
                break;
            case 'COMPLETE_PURCHASE':
                await handleCompletePurchaseHttp(operationId, promoCode, accountPool);
                break;
            case 'CONFIRM_PURCHASE':
                await handleConfirmPurchaseHttp(operationId, accountPool);
                break;
            case 'CANCEL_CONFIRM':
                await handleCancelConfirmHttp(operationId, accountPool);
                break;
            default:
                throw new Error(`Unsupported operation type for HTTP: ${type}`);
        }
    } catch (error: any) {
        if (error instanceof OperationCancelledError) {
            console.log(`🚫 [HTTP] Operation ${operationId} cancelled`);
            return;
        }

        console.error(`❌ [HTTP] Operation ${operationId} failed:`, error.message);

        // Fetch userId/amount if not in job
        let opUserId = userId;
        let opAmount = amount;
        if (!opUserId || !opAmount) {
            const op = await prisma.operation.findUnique({
                where: { id: operationId },
                select: { userId: true, amount: true, beinAccountId: true }
            });
            opUserId = op?.userId || undefined;
            opAmount = op?.amount || undefined;
            selectedAccountId = op?.beinAccountId || null;
        }

        // Mark failed and refund
        if (opUserId && opAmount) {
            await refundUser(operationId, opUserId, opAmount, error.message);
        }
        await markOperationFailed(operationId, { type: 'UNKNOWN', message: error.message, recoverable: false }, 1);
    }
}

/**
 * START_RENEWAL - Login, check card, load packages
 */
async function handleStartRenewalHttp(
    operationId: string,
    cardNumber: string,
    accountPool: AccountPoolManager
): Promise<void> {
    console.log(`🚀 [HTTP] Starting renewal for ${operationId}`);

    await checkIfCancelled(operationId);

    const operation = await prisma.operation.findUnique({
        where: { id: operationId },
        select: { userId: true }
    });

    // Mark as PROCESSING
    await prisma.operation.update({
        where: { id: operationId },
        data: { status: 'PROCESSING' }
    });

    // Get next available account
    const selectedAccount = await accountPool.getNextAvailableAccount();
    if (!selectedAccount) {
        throw new Error('NO_AVAILABLE_ACCOUNTS: لا توجد حسابات متاحة');
    }

    await prisma.operation.update({
        where: { id: operationId },
        data: { beinAccountId: selectedAccount.id }
    });

    console.log(`🔑 [HTTP] Using account: ${selectedAccount.label || selectedAccount.username}`);

    // Get HTTP client for this account
    const client = await getHttpClient(selectedAccount);

    // Reload config in case settings changed
    await client.reloadConfig();

    await checkIfCancelled(operationId);

    // Step 1: Login
    const loginResult = await client.login(
        selectedAccount.username,
        selectedAccount.password,
        selectedAccount.totpSecret || undefined
    );

    if (loginResult.requiresCaptcha && loginResult.captchaImage) {
        console.log(`🧩 [HTTP] CAPTCHA required for ${operationId}`);

        let solution: string | null = null;

        // Try auto-solve with 2Captcha first
        const captchaApiKey = await getCaptchaApiKey();
        if (captchaApiKey) {
            try {
                console.log(`🤖 [HTTP] Attempting auto-solve with 2Captcha...`);
                const captchaSolver = new CaptchaSolver(captchaApiKey);
                solution = await captchaSolver.solve(loginResult.captchaImage);
                console.log(`✅ [HTTP] CAPTCHA auto-solved: ${solution}`);
            } catch (autoSolveError: any) {
                console.log(`⚠️ [HTTP] Auto-solve failed: ${autoSolveError.message}, falling back to manual`);
            }
        } else {
            console.log(`⚠️ [HTTP] No 2Captcha API key configured, using manual entry`);
        }

        // Fallback to manual if auto-solve failed or not configured
        if (!solution) {
            await prisma.operation.update({
                where: { id: operationId },
                data: {
                    status: 'AWAITING_CAPTCHA',
                    captchaImage: loginResult.captchaImage,
                    captchaExpiry: new Date(Date.now() + CAPTCHA_TIMEOUT_MS)
                }
            });

            solution = await waitForCaptchaSolution(operationId);
            if (!solution) {
                throw new Error('CAPTCHA_TIMEOUT: لم يتم إدخال كود التحقق');
            }
        }

        // Submit with CAPTCHA
        const loginWithCaptcha = await client.submitLogin(
            selectedAccount.username,
            selectedAccount.password,
            selectedAccount.totpSecret || undefined,
            solution
        );

        if (!loginWithCaptcha.success) {
            throw new Error(loginWithCaptcha.error || 'Login failed after CAPTCHA');
        }
    } else if (!loginResult.success) {
        throw new Error(loginResult.error || 'Login failed');
    }

    await checkIfCancelled(operationId);

    // Step 2: Check card (extract STB)
    console.log(`🔍 [HTTP] Checking card...`);
    const checkResult = await client.checkCard(cardNumber);
    if (!checkResult.success) {
        throw new Error(checkResult.error || 'Card check failed');
    }

    await checkIfCancelled(operationId);

    // Step 3: Load packages
    console.log(`📦 [HTTP] Loading packages...`);
    const packagesResult = await client.loadPackages(cardNumber);
    if (!packagesResult.success) {
        throw new Error(packagesResult.error || 'Failed to load packages');
    }

    // Convert to format expected by frontend
    const packages = packagesResult.packages.map((pkg, i) => ({
        index: pkg.index,
        name: pkg.name,
        price: pkg.price,
        checkboxSelector: pkg.checkboxValue // Keep for compatibility
    }));

    // Update operation with packages
    await prisma.operation.update({
        where: { id: operationId },
        data: {
            status: 'AWAITING_PACKAGE',
            stbNumber: packagesResult.stbNumber || client.getSTBNumber(),
            availablePackages: packages,
            captchaImage: null,
            captchaSolution: null,
            captchaExpiry: null
        }
    });

    console.log(`✅ [HTTP] Packages loaded for ${operationId}: ${packages.length} packages`);
}

/**
 * COMPLETE_PURCHASE - Select package, add to cart, enter STB, pause
 */
async function handleCompletePurchaseHttp(
    operationId: string,
    promoCode: string | undefined,
    accountPool: AccountPoolManager
): Promise<void> {
    console.log(`💳 [HTTP] Completing purchase for ${operationId}`);

    await checkIfCancelled(operationId);

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
    });

    if (!operation || !operation.beinAccountId) {
        throw new Error('Operation or account not found');
    }

    await prisma.operation.update({
        where: { id: operationId },
        data: { status: 'COMPLETING' }
    });

    // Get account
    const account = await prisma.beinAccount.findUnique({
        where: { id: operation.beinAccountId }
    });
    if (!account) throw new Error('Account not found');

    const client = await getHttpClient(account);

    const selectedPackage = operation.selectedPackage as {
        index: number;
        name: string;
        price: number;
        checkboxSelector: string
    } | null;

    if (!selectedPackage) {
        throw new Error('No package selected');
    }

    // Convert to AvailablePackage format
    const pkg: AvailablePackage = {
        index: selectedPackage.index,
        name: selectedPackage.name,
        price: selectedPackage.price,
        checkboxValue: selectedPackage.checkboxSelector
    };

    const result = await client.completePurchase(
        pkg,
        operation.promoCode || promoCode,
        operation.stbNumber || undefined,
        true // skipFinalClick - pause for confirmation
    );

    if (result.awaitingConfirm) {
        console.log(`⏸️ [HTTP] Awaiting confirmation for ${operationId}`);

        await prisma.operation.update({
            where: { id: operationId },
            data: {
                status: 'AWAITING_FINAL_CONFIRM',
                finalConfirmExpiry: new Date(Date.now() + 120000),
                responseMessage: result.message
            }
        });

        if (operation.userId) {
            await createNotification({
                userId: operation.userId,
                title: '⚠️ تأكيد الدفع مطلوب',
                message: `${selectedPackage.name} - ${selectedPackage.price} USD`,
                type: 'warning',
                link: '/dashboard/operations'
            });
        }
        return;
    }

    // If not awaiting (shouldn't happen with skipFinalClick=true)
    if (result.success) {
        await prisma.operation.update({
            where: { id: operationId },
            data: {
                status: 'COMPLETED',
                responseMessage: result.message,
                completedAt: new Date()
            }
        });
        await accountPool.markAccountUsed(operation.beinAccountId);
    } else {
        throw new Error(result.message);
    }
}

/**
 * CONFIRM_PURCHASE - Click Ok to finalize
 */
async function handleConfirmPurchaseHttp(
    operationId: string,
    accountPool: AccountPoolManager
): Promise<void> {
    console.log(`✅ [HTTP] Confirming purchase for ${operationId}`);

    await checkIfCancelled(operationId);

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
    });

    if (!operation || !operation.beinAccountId) {
        throw new Error('Operation or account not found');
    }

    if (operation.status !== 'AWAITING_FINAL_CONFIRM') {
        throw new Error(`Invalid status: ${operation.status}`);
    }

    if (operation.finalConfirmExpiry && new Date() > operation.finalConfirmExpiry) {
        if (operation.userId && operation.amount) {
            await refundUser(operationId, operation.userId, operation.amount, 'انتهت مهلة التأكيد');
        }
        await markOperationFailed(operationId, { type: 'TIMEOUT', message: 'انتهت مهلة التأكيد', recoverable: false }, 1);
        throw new Error('انتهت مهلة التأكيد');
    }

    await prisma.operation.update({
        where: { id: operationId },
        data: { status: 'COMPLETING' }
    });

    const account = await prisma.beinAccount.findUnique({
        where: { id: operation.beinAccountId }
    });
    if (!account) throw new Error('Account not found');

    const client = await getHttpClient(account);
    const result = await client.confirmPurchase();

    const selectedPackage = operation.selectedPackage as { name: string } | null;

    if (result.success) {
        await prisma.operation.update({
            where: { id: operationId },
            data: {
                status: 'COMPLETED',
                responseMessage: result.message,
                completedAt: new Date(),
                finalConfirmExpiry: null
            }
        });

        await accountPool.markAccountUsed(operation.beinAccountId);

        if (operation.userId) {
            await createNotification({
                userId: operation.userId,
                title: 'تم التجديد بنجاح',
                message: `${selectedPackage?.name || 'الباقة'} - ${result.message}`,
                type: 'success',
                link: '/dashboard/history'
            });
        }

        console.log(`✅ [HTTP] Purchase confirmed for ${operationId}`);
    } else {
        if (operation.userId && operation.amount) {
            await refundUser(operationId, operation.userId, operation.amount, result.message);
        }
        await markOperationFailed(operationId, { type: 'UNKNOWN', message: result.message, recoverable: false }, 1);
        throw new Error(result.message);
    }
}

/**
 * CANCEL_CONFIRM - Cancel and refund
 */
async function handleCancelConfirmHttp(
    operationId: string,
    accountPool: AccountPoolManager
): Promise<void> {
    console.log(`🚫 [HTTP] Cancelling purchase for ${operationId}`);

    const operation = await prisma.operation.findUnique({
        where: { id: operationId },
        select: {
            id: true,
            userId: true,
            beinAccountId: true,
            amount: true,
            status: true
        }
    });

    if (!operation) {
        throw new Error('Operation not found');
    }

    if (operation.status !== 'AWAITING_FINAL_CONFIRM') {
        throw new Error(`Invalid status: ${operation.status}`);
    }

    // Click Cancel if account available
    if (operation.beinAccountId) {
        try {
            const account = await prisma.beinAccount.findUnique({
                where: { id: operation.beinAccountId }
            });
            if (account) {
                const client = await getHttpClient(account);
                await client.cancelPurchase();
            }
        } catch (e: any) {
            console.log(`⚠️ [HTTP] Failed to click cancel: ${e.message}`);
        }
    }

    // Refund with double-refund protection
    if (operation.userId && operation.amount) {
        const existingRefund = await prisma.transaction.findFirst({
            where: { operationId, type: 'REFUND' }
        });

        if (!existingRefund) {
            await prisma.$transaction(async (tx) => {
                const user = await tx.user.findUnique({
                    where: { id: operation.userId },
                    select: { balance: true }
                });

                if (user) {
                    const newBalance = user.balance + operation.amount!;
                    await tx.user.update({
                        where: { id: operation.userId },
                        data: { balance: newBalance }
                    });
                    await tx.transaction.create({
                        data: {
                            userId: operation.userId,
                            type: 'REFUND',
                            amount: operation.amount!,
                            balanceAfter: newBalance,
                            operationId,
                            notes: 'استرداد - إلغاء المستخدم'
                        }
                    });
                    console.log(`💰 [HTTP] Refunded ${operation.amount} to user`);
                }
            });
        }
    }

    await prisma.operation.update({
        where: { id: operationId },
        data: {
            status: 'CANCELLED',
            responseMessage: 'تم إلغاء العملية',
            completedAt: new Date(),
            finalConfirmExpiry: null
        }
    });

    if (operation.userId) {
        await createNotification({
            userId: operation.userId,
            title: 'تم إلغاء العملية',
            message: 'تم إلغاء عملية الشراء واسترداد المبلغ',
            type: 'info',
            link: '/dashboard/history'
        });
    }

    if (operation.beinAccountId) {
        await accountPool.markAccountUsed(operation.beinAccountId);
    }

    console.log(`✅ [HTTP] Operation ${operationId} cancelled and refunded`);
}

/**
 * Wait for CAPTCHA solution from user
 */
async function waitForCaptchaSolution(operationId: string): Promise<string | null> {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < CAPTCHA_TIMEOUT_MS) {
        const op = await prisma.operation.findUnique({
            where: { id: operationId },
            select: { captchaSolution: true, status: true }
        });

        if (op?.status === 'CANCELLED') {
            throw new OperationCancelledError(operationId);
        }

        if (op?.captchaSolution) {
            console.log(`🧩 [HTTP] CAPTCHA solution received`);
            return op.captchaSolution;
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return null;
}

/**
 * Cleanup all HTTP clients
 */
export function closeAllHttpClients(): void {
    for (const [id, client] of httpClients) {
        client.resetSession();
    }
    httpClients.clear();
    console.log('[HTTP] All HTTP clients closed');
}
