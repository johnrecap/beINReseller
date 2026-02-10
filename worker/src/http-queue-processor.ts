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
import { AccountPoolManager, AccountQueueManager, getQueueManager } from './pool';
import { refundUser, markOperationFailed } from './utils/error-handler';
import { createNotification, notifyAdminLowBalance } from './utils/notification';
import { CaptchaSolver } from './utils/captcha-solver';
import { BeinAccount, Proxy } from '@prisma/client';
import { ProxyConfig } from './types/proxy';
import { trackOperationComplete } from './lib/activity-tracker';
import {
    getSessionFromCache,
    saveSessionToCache,
    deleteSessionFromCache,
    extendSessionTTL,
    acquireLoginLock,
    releaseLoginLock,
    waitForLoginComplete
} from './lib/session-cache';
import {
    getCachedPackages,
    cachePackages,
    getCachedSTB,
    cacheSTB,
    invalidatePackageCache
} from './lib/package-cache';

// Heartbeat configuration
const HEARTBEAT_TTL_SECONDS = 15;  // Operation expires after 15s without heartbeat

interface OperationJobData {
    operationId: string;
    type: 'RENEW' | 'CHECK_BALANCE' | 'REFRESH_SIGNAL' | 'SIGNAL_REFRESH' | 'START_RENEWAL' | 'COMPLETE_PURCHASE' | 'APPLY_PROMO' | 'CONFIRM_PURCHASE' | 'CANCEL_CONFIRM' | 'SIGNAL_CHECK' | 'SIGNAL_ACTIVATE' | 'CHECK_ACCOUNT_BALANCE' | 'START_INSTALLMENT' | 'CONFIRM_INSTALLMENT';
    cardNumber: string;
    duration?: string;
    promoCode?: string;
    userId?: string;
    amount?: number;
    accountId?: string;  // For CHECK_ACCOUNT_BALANCE
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

// Worker ID for login locking (unique per process)
const WORKER_ID = `worker-${process.pid}-${Date.now()}`;

/**
 * Get or create HTTP client for an account
 * Includes proxy config if the account has one assigned
 * Now also attempts to restore session from Redis cache
 * 
 * OPTIMIZATION: Parallel session restore + config reload
 */
async function getHttpClient(account: BeinAccount & { proxy?: Proxy | null }): Promise<HttpClientService> {
    // Include proxy in cache key to separate clients per proxy
    const cacheKey = account.proxyId ? `${account.id}:${account.proxyId}` : account.id;
    let client = httpClients.get(cacheKey);
    let isNewClient = false;

    if (!client) {
        // Build proxy config from account's relation
        let proxyConfig: ProxyConfig | undefined;
        if (account.proxy) {
            proxyConfig = {
                host: account.proxy.host,
                port: account.proxy.port,
                username: account.proxy.username,
                password: account.proxy.password
            };
        }
        client = new HttpClientService(proxyConfig);
        await client.initialize();
        httpClients.set(cacheKey, client);
        isNewClient = true;
        console.log(`[HTTP] Created client for ${account.username}${proxyConfig ? ` with proxy ${proxyConfig.host}:${proxyConfig.port}` : ' without proxy'}`);
    }

    // OPTIMIZATION: Run session restore and config reload in parallel
    try {
        const [cachedSession, _] = await Promise.all([
            getSessionFromCache(account.id),
            isNewClient ? Promise.resolve() : client.reloadConfig()  // Only reload for existing clients
        ]);

        if (cachedSession) {
            await client.importSession(cachedSession);
            client.markSessionValidFromCache(cachedSession.expiresAt);
            console.log(`[HTTP] 🔄 Restored session from Redis cache for ${account.username}`);
        }
    } catch (error) {
        console.log(`[HTTP] ⚠️ Failed to restore cached session for ${account.username}, will login fresh`);
        await deleteSessionFromCache(account.id);
    }

    return client;
}

/**
 * Check if an error message indicates session expiry
 */
function isSessionExpiredError(message: string | undefined): boolean {
    if (!message) return false;
    return message.includes('Session Expired') ||
        message.includes('Session expired') ||
        message.includes('login page') ||
        message.includes('Login page');
}

/**
 * Perform re-login with CAPTCHA handling
 * @returns true if login successful, false otherwise
 */
async function performReLogin(
    httpClient: HttpClientService,
    account: BeinAccount & { proxy?: Proxy | null },
    operationName: string
): Promise<boolean> {
    // Clear cached session
    await deleteSessionFromCache(account.id);
    httpClient.invalidateSession();

    // Perform fresh login
    const loginResult = await httpClient.login(
        account.username,
        account.password,
        account.totpSecret || undefined
    );

    if (loginResult.requiresCaptcha && loginResult.captchaImage) {
        // Try 2Captcha auto-solve
        console.log(`[HTTP] 🧩 CAPTCHA required during session retry, attempting auto-solve...`);
        const captchaApiKey = await getCaptchaApiKey();

        if (captchaApiKey) {
            try {
                const captchaSolver = new CaptchaSolver(captchaApiKey);
                const solution = await captchaSolver.solve(loginResult.captchaImage);
                console.log(`[HTTP] ✅ CAPTCHA auto-solved: ${solution}`);

                // Submit login with CAPTCHA solution
                const loginWithCaptcha = await httpClient.submitLogin(
                    account.username,
                    account.password,
                    account.totpSecret || undefined,
                    solution
                );

                if (!loginWithCaptcha.success) {
                    throw new Error(`Re-login with CAPTCHA failed: ${loginWithCaptcha.error}`);
                }

                console.log(`[HTTP] ✅ Re-login with CAPTCHA successful`);
            } catch (captchaError: any) {
                throw new Error(`CAPTCHA auto-solve failed: ${captchaError.message}`);
            }
        } else {
            throw new Error(`Re-login requires CAPTCHA but no API key configured`);
        }
    } else if (!loginResult.success) {
        throw new Error(`Re-login failed: ${loginResult.error}`);
    }

    // Save new session to cache
    const newSession = await httpClient.exportSession();
    // FIX: Update timestamps before saving
    const now = Date.now();
    newSession.expiresAt = now + (15 * 60 * 1000);  // 15 min from now
    newSession.loginTimestamp = now;
    await saveSessionToCache(account.id, newSession, httpClient.getSessionTimeout());
    console.log(`[HTTP] ✅ Fresh login successful for ${operationName}`);

    return true;
}

/**
 * Execute an operation with automatic session retry on expiry
 * If session expires mid-operation, re-login and retry once
 * 
 * ENHANCED: Now handles both thrown errors AND returned result objects with error fields
 * This fixes the bug where loadPackages() returns { success: false, error: "Session Expired..." }
 * instead of throwing, which bypassed the retry logic.
 * 
 * @param httpClient - The HTTP client to use
 * @param account - The beIN account
 * @param operation - The async operation to execute
 * @param operationName - Name for logging
 * @returns The result of the operation
 */
async function withSessionRetry<T>(
    httpClient: HttpClientService,
    account: BeinAccount & { proxy?: Proxy | null },
    operation: () => Promise<T>,
    operationName: string
): Promise<T> {
    let result: T;

    try {
        result = await operation();
    } catch (error: any) {
        // Handle thrown errors
        if (!isSessionExpiredError(error.message)) {
            throw error;  // Not a session error, rethrow
        }

        console.log(`[HTTP] ⚠️ Session expired (thrown) during ${operationName}, performing fresh login...`);
        await performReLogin(httpClient, account, operationName);

        // Retry the operation once
        return await operation();
    }

    // ENHANCED: Check if result object indicates session expiry
    // This catches methods that return { success: false, error: "Session Expired..." } instead of throwing
    if (result && typeof result === 'object' && 'success' in result && 'error' in result) {
        const resultObj = result as unknown as { success: boolean; error?: string };

        if (!resultObj.success && isSessionExpiredError(resultObj.error)) {
            console.log(`[HTTP] ⚠️ Session expired (returned) during ${operationName}, performing fresh login...`);
            console.log(`[HTTP] Error was: ${resultObj.error}`);

            await performReLogin(httpClient, account, operationName);

            // Retry the operation once
            console.log(`[HTTP] 🔄 Retrying ${operationName} after re-login...`);
            return await operation();
        }
    }

    return result;
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

// AUDIT FIX 3.1: CAPTCHA timeout with safe fallback
// TODO: Move to database settings (worker_captcha_timeout_seconds)
const CAPTCHA_TIMEOUT_MS = parseInt(process.env.CAPTCHA_TIMEOUT || '120') * 1000;

// AUDIT FIX 4.2: Per-flow session timeouts
const SESSION_TIMEOUTS = {
    confirmPurchase: 30 * 60 * 1000,   // 30 min (short - just confirmation)
    completePurchase: 60 * 60 * 1000,  // 60 min (longer - user selecting package)
    signalActivate: 30 * 60 * 1000     // 30 min (short - just activation)
};

/**
 * AUDIT FIX 4.2: Validate session age with per-flow timeout
 * @param savedAt - ISO string of when session was saved
 * @param flowType - Type of flow to determine timeout
 * @throws Error if session is too old
 */
function validateSessionAge(savedAt: string, flowType: keyof typeof SESSION_TIMEOUTS): void {
    const savedTime = new Date(savedAt).getTime();
    const now = Date.now();
    const sessionAge = now - savedTime;
    const maxAgeMs = SESSION_TIMEOUTS[flowType];
    const ageMinutes = Math.floor(sessionAge / 60000);
    const maxMinutes = Math.floor(maxAgeMs / 60000);

    if (sessionAge > maxAgeMs) {
        console.error(`[HTTP] SESSION TOO OLD: ${ageMinutes} minutes (max: ${maxMinutes} minutes for ${flowType})`);
        throw new Error(`انتهت صلاحية الجلسة (${ageMinutes} دقيقة). برجاء إعادة العملية.`);
    }

    console.log(`[HTTP] Session age: ${ageMinutes} minutes (within ${maxMinutes} min limit for ${flowType})`);
}

/**
 * Main processor for HTTP-based operations
 */
export async function processOperationHttp(
    job: Job<OperationJobData>,
    accountPool: AccountPoolManager
): Promise<void> {
    const { operationId, type, cardNumber, promoCode, userId, amount, accountId } = job.data;
    let selectedAccountId: string | null = null;

    console.log(`📥 [HTTP] Processing ${operationId}: ${type}`);

    try {
        switch (type) {
            case 'CHECK_ACCOUNT_BALANCE':
                if (accountId) {
                    try {
                        await handleCheckAccountBalance(accountId);
                    } catch (balanceError: any) {
                        console.error(`❌ [HTTP] CHECK_ACCOUNT_BALANCE failed for ${accountId}:`, balanceError.message);
                        // Don't throw - this job type has no operation to refund
                    }
                }
                return; // Exit early - no operation to update on success or failure
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
            case 'SIGNAL_REFRESH':
                await handleSignalRefreshHttp(operationId, cardNumber, accountPool);
                break;
            case 'SIGNAL_CHECK':
                await handleSignalCheckHttp(operationId, cardNumber, accountPool);
                break;
            case 'SIGNAL_ACTIVATE':
                await handleSignalActivateHttp(operationId, cardNumber, accountPool);
                break;
            case 'START_INSTALLMENT':
                await handleStartInstallmentHttp(operationId, cardNumber, accountPool);
                break;
            case 'CONFIRM_INSTALLMENT':
                await handleConfirmInstallmentHttp(operationId, cardNumber, accountPool);
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
 * 
 * OPTIMIZATIONS:
 * - Package caching: If same card was checked <10 min ago, return cached packages instantly
 * - STB caching: Skip checkCard() if STB is cached (1 hour TTL)
 * - Session retry: Auto re-login if session expires mid-operation
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

    // Get next available account with queue-based retry
    // If no account is immediately available, wait in queue up to 2 minutes
    const queueManager = getQueueManager(accountPool);
    const queueResult = await queueManager.acquireAccountWithQueue(operationId, 0, 120_000);

    if (!queueResult.account) {
        if (queueResult.timedOut) {
            throw new Error('NO_AVAILABLE_ACCOUNTS: لا توجد حسابات متاحة - انتهت مهلة الانتظار في الطابور');
        }
        throw new Error(queueResult.error || 'NO_AVAILABLE_ACCOUNTS: لا توجد حسابات متاحة');
    }

    const selectedAccount = queueResult.account;
    if (queueResult.waitTimeMs > 0) {
        console.log(`[HTTP] Operation ${operationId} waited ${Math.round(queueResult.waitTimeMs / 1000)}s in queue`);
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

    // Step 1: Login (with Redis session caching and login locking)
    let needsFreshLogin = true;

    // Check if we already have a valid session from Redis cache
    if (client.isSessionActive()) {
        console.log(`[HTTP] ✅ Using cached session for ${selectedAccount.username}`);
        needsFreshLogin = false;
    }

    if (needsFreshLogin) {
        // Try to acquire login lock to prevent race conditions
        const lockAcquired = await acquireLoginLock(selectedAccount.id, WORKER_ID);

        if (!lockAcquired) {
            // Another worker is logging in, wait for it to complete
            console.log(`[HTTP] ⏳ Another worker is logging in, waiting...`);
            const loginCompleted = await waitForLoginComplete(selectedAccount.id);

            if (loginCompleted) {
                // Try to get the session from cache now
                const cachedSession = await getSessionFromCache(selectedAccount.id);
                if (cachedSession) {
                    await client.importSession(cachedSession);
                    client.markSessionValidFromCache(cachedSession.expiresAt);
                    console.log(`[HTTP] ✅ Got session from cache after waiting`);
                    needsFreshLogin = false;
                }
            }
        }
    }

    if (needsFreshLogin) {
        // Perform actual login
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
                // Set heartbeat expiry for auto-cancel if user leaves page
                const now = new Date();
                const heartbeatExpiry = new Date(now.getTime() + HEARTBEAT_TTL_SECONDS * 1000);

                await prisma.operation.update({
                    where: { id: operationId },
                    data: {
                        status: 'AWAITING_CAPTCHA',
                        captchaImage: loginResult.captchaImage,
                        captchaExpiry: new Date(Date.now() + CAPTCHA_TIMEOUT_MS),
                        // Heartbeat system - allows cleanup cron to auto-cancel stuck operations
                        lastHeartbeat: now,
                        heartbeatExpiry: heartbeatExpiry
                    }
                });

                solution = await waitForCaptchaSolution(operationId);
                if (!solution) {
                    // Release lock before throwing
                    await releaseLoginLock(selectedAccount.id, WORKER_ID);
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
                // Release lock before throwing
                await releaseLoginLock(selectedAccount.id, WORKER_ID);
                throw new Error(loginWithCaptcha.error || 'Login failed after CAPTCHA');
            }
        } else if (!loginResult.success) {
            // Release lock before throwing
            await releaseLoginLock(selectedAccount.id, WORKER_ID);
            throw new Error(loginResult.error || 'Login failed');
        }

        // Login successful - save session to Redis cache
        try {
            const sessionData = await client.exportSession();
            const sessionTimeout = client.getSessionTimeout();
            await saveSessionToCache(selectedAccount.id, sessionData, sessionTimeout);
            console.log(`[HTTP] 💾 Session saved to Redis cache (TTL: ${sessionTimeout} min)`);
        } catch (saveError) {
            console.error(`[HTTP] ⚠️ Failed to save session to cache:`, saveError);
        }

        // Release login lock
        await releaseLoginLock(selectedAccount.id, WORKER_ID);
    }

    await checkIfCancelled(operationId);

    // ============================================
    // OPTIMIZATION 1: STB Cache - Skip checkCard if we have cached STB
    // OPTIMIZATION 2: Session Retry - Auto re-login on session expiry
    // NOTE: We MUST still call loadPackages() to get correct ViewState!
    //       Package cache is only used for faster display, NOT to skip loadPackages
    // ============================================

    // Step 2: Check card (extract STB) - with caching
    let stbNumber: string | undefined;

    // Check BOTH package cache and STB cache for cached STB
    const cachedPackageData = await getCachedPackages(cardNumber);
    const cachedStb = cachedPackageData?.stbNumber || await getCachedSTB(cardNumber);

    if (cachedStb) {
        // STB is cached - skip check page entirely (saves ~600ms)
        console.log(`[HTTP] ⚡ STB CACHE HIT - Skipping checkCard (STB: ${cachedStb})`);
        client.setSTBNumber(cachedStb);
        stbNumber = cachedStb;
    } else {
        // Need to call check page - with session retry
        console.log(`🔍 [HTTP] Checking card...`);
        const checkResult = await withSessionRetry(
            client,
            selectedAccount,
            () => client.checkCard(cardNumber),
            'checkCard'
        );

        if (!checkResult.success) {
            throw new Error(checkResult.error || 'Card check failed');
        }

        stbNumber = checkResult.stbNumber;

        // Cache STB for future operations (1 hour TTL)
        if (stbNumber) {
            await cacheSTB(cardNumber, stbNumber);
        }
    }

    await checkIfCancelled(operationId);

    // Step 3: Load packages - ALWAYS call this to get correct ViewState
    // Even if packages are cached, we need fresh ViewState for completePurchase
    console.log(`📦 [HTTP] Loading packages...`);
    const packagesResult = await withSessionRetry(
        client,
        selectedAccount,
        () => client.loadPackages(cardNumber),
        'loadPackages'
    );

    if (!packagesResult.success) {
        throw new Error(packagesResult.error || 'Failed to load packages');
    }

    // Use STB from check or from packagesResult
    const finalStbNumber = stbNumber || packagesResult.stbNumber || client.getSTBNumber();

    // Update account's dealer balance (for admin display)
    if (packagesResult.dealerBalance !== undefined) {
        await prisma.beinAccount.update({
            where: { id: selectedAccount.id },
            data: {
                dealerBalance: packagesResult.dealerBalance,
                balanceUpdatedAt: new Date()
            }
        });
        console.log(`[HTTP] 💰 Updated account balance: ${packagesResult.dealerBalance} USD`);
    }

    // Convert to format expected by frontend
    const packages = packagesResult.packages.map((pkg, i) => ({
        index: pkg.index,
        name: pkg.name,
        price: pkg.price,
        checkboxSelector: pkg.checkboxValue, // Keep for compatibility (backend)
        checkboxValue: pkg.checkboxValue,    // Add for Flutter compatibility
    }));

    // ============================================
    // OPTIMIZATION 4: Cache packages for future requests
    // ============================================
    await cachePackages(
        cardNumber,
        packagesResult.packages,
        finalStbNumber || null,
        packagesResult.dealerBalance || null
    );

    // CRITICAL: Export session data for cross-worker access
    // Different PM2 workers have separate memory, so we need to persist
    // ViewState and cookies in the database
    const sessionData = await client.exportSession();
    console.log(`[HTTP] Session exported: ViewState=${sessionData.viewState?.__VIEWSTATE?.length || 0} chars, Cookies=${sessionData.cookies.length} chars`);

    // Update operation with packages AND session data
    // CRITICAL: Set heartbeatExpiry so cleanup cron knows when to auto-cancel
    const now = new Date();
    const heartbeatExpiry = new Date(now.getTime() + HEARTBEAT_TTL_SECONDS * 1000);

    await prisma.operation.update({
        where: { id: operationId },
        data: {
            status: 'AWAITING_PACKAGE',
            stbNumber: finalStbNumber,
            availablePackages: packages,
            captchaImage: null,
            captchaSolution: null,
            captchaExpiry: null,
            // Heartbeat system - allows cleanup cron to auto-cancel stuck operations
            lastHeartbeat: now,
            heartbeatExpiry: heartbeatExpiry,
            // Store session data for COMPLETE_PURCHASE to restore
            responseData: JSON.stringify({
                sessionData: sessionData,
                dealerBalance: packagesResult.dealerBalance,  // For balance validation
                savedAt: new Date().toISOString()
            })
        }
    });

    // IMPORTANT: Release account lock after packages are loaded
    // The account is no longer needed while user selects package
    // This allows other operations to use the account
    try {
        await accountPool.releaseLock(selectedAccount.id);
        console.log(`🔓 [HTTP] Released account lock for ${selectedAccount.username} - user selecting package`);
    } catch (releaseError) {
        console.warn(`[HTTP] Failed to release account lock:`, releaseError);
    }

    console.log(`✅ [HTTP] Packages loaded for ${operationId}: ${packages.length} packages, Dealer Balance: ${packagesResult.dealerBalance || 'N/A'} USD`);
}

/**
 * COMPLETE_PURCHASE - Select package, add to cart, enter STB, pause
 * 
 * ENHANCED: Now retries with different beIN accounts when failures occur:
 * - Insufficient balance
 * - Session errors
 * - Login failures
 * - CAPTCHA failures
 * 
 * Will try ALL available accounts before giving up.
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
            amount: true,
            cardNumber: true,
            responseData: true  // Contains saved session from START_RENEWAL
        }
    });

    if (!operation || !operation.beinAccountId) {
        throw new Error('Operation or account not found');
    }

    const selectedPackage = operation.selectedPackage as {
        index: number;
        name: string;
        price: number;
        checkboxSelector: string
    } | null;

    if (!selectedPackage) {
        throw new Error('No package selected');
    }

    await prisma.operation.update({
        where: { id: operationId },
        data: { status: 'COMPLETING' }
    });

    // Track which accounts we've tried
    const triedAccountIds: string[] = [];
    let currentAccountId = operation.beinAccountId;
    let lastError = '';

    // Retry loop - try all available accounts
    while (true) {
        const attemptNumber = triedAccountIds.length + 1;
        console.log(`[HTTP] 🔄 Attempt ${attemptNumber}: Trying account ${currentAccountId}`);

        const attemptResult = await attemptPurchaseWithAccount(
            operationId,
            operation,
            currentAccountId,
            selectedPackage,
            promoCode,
            accountPool,
            triedAccountIds
        );

        if (attemptResult.success) {
            console.log(`[HTTP] ✅ Purchase completed successfully on attempt ${attemptNumber}`);
            return;
        }

        // Mark this account as tried
        triedAccountIds.push(currentAccountId);
        lastError = attemptResult.error || 'Unknown error';

        // Check if we should retry with a different account
        if (!attemptResult.shouldRetryDifferentAccount) {
            console.log(`[HTTP] ❌ Error is not recoverable with different account: ${lastError}`);
            throw new Error(lastError);
        }

        console.log(`[HTTP] ⚠️ Attempt ${attemptNumber} failed: ${lastError}`);
        console.log(`[HTTP] 🔍 Looking for alternative account (tried: ${triedAccountIds.length})...`);

        // Try to get another account (with minimum balance filter for balance errors)
        const minBalance = attemptResult.isBalanceError ? selectedPackage.price : undefined;
        const nextAccount = await accountPool.getNextAvailableAccountExcluding(
            triedAccountIds,
            minBalance
        );

        if (!nextAccount) {
            console.log(`[HTTP] ❌ No more accounts available after trying ${triedAccountIds.length}`);

            // Final error message
            const finalError = attemptResult.isBalanceError
                ? 'رصيد حساب beIN غير كافي. لا توجد حسابات أخرى متاحة برصيد كافٍ.'
                : `فشلت العملية بعد تجربة ${triedAccountIds.length} حسابات. ${lastError}`;

            throw new Error(finalError);
        }

        // Update operation with new account
        await prisma.operation.update({
            where: { id: operationId },
            data: { beinAccountId: nextAccount.id }
        });

        currentAccountId = nextAccount.id;
        console.log(`[HTTP] 🔄 Retrying with account: ${nextAccount.label || nextAccount.username} (Balance: ${nextAccount.dealerBalance || 'unknown'} USD)`);
    }
}

/**
 * Attempt purchase with a specific account
 * Returns result indicating success, failure, or need to retry with different account
 */
async function attemptPurchaseWithAccount(
    operationId: string,
    operation: {
        id: string;
        userId: string | null;
        cardNumber: string;
        promoCode: string | null;
        stbNumber: string | null;
        amount: number | null;
        responseData: any;
    },
    accountId: string,
    selectedPackage: {
        index: number;
        name: string;
        price: number;
        checkboxSelector: string;
    },
    promoCode: string | undefined,
    accountPool: AccountPoolManager,
    triedAccountIds: string[]
): Promise<{
    success: boolean;
    shouldRetryDifferentAccount: boolean;
    isBalanceError: boolean;
    error?: string;
}> {
    try {
        // Get account
        const account = await prisma.beinAccount.findUnique({
            where: { id: accountId },
            include: { proxy: true }
        });

        if (!account) {
            return {
                success: false,
                shouldRetryDifferentAccount: true,
                isBalanceError: false,
                error: 'Account not found'
            };
        }

        const client = await getHttpClient(account);

        // Try to restore session from database (for same-account retry from START_RENEWAL)
        let dealerBalance: number | undefined;
        const isOriginalAccount = triedAccountIds.length === 0;

        if (isOriginalAccount && operation.responseData) {
            try {
                const savedData = JSON.parse(operation.responseData as string);

                // Validate session age
                if (savedData.savedAt) {
                    validateSessionAge(savedData.savedAt, 'completePurchase');
                }

                if (savedData.sessionData) {
                    console.log(`[HTTP] 🔄 Restoring session from database`);
                    await client.importSession(savedData.sessionData);
                }
                dealerBalance = savedData.dealerBalance;
            } catch (parseError: any) {
                console.log(`[HTTP] ⚠️ Could not restore saved session: ${parseError.message}`);
            }
        }

        // For non-original account or if session restore failed, need fresh login + loadPackages
        if (!isOriginalAccount || !client.isSessionActive()) {
            console.log(`[HTTP] 🔑 New account - need fresh login and package load`);

            // Perform login
            const loginResult = await client.login(
                account.username,
                account.password,
                account.totpSecret || undefined
            );

            if (loginResult.requiresCaptcha && loginResult.captchaImage) {
                console.log(`[HTTP] 🧩 CAPTCHA required for login, attempting auto-solve...`);
                const captchaApiKey = await getCaptchaApiKey();

                if (!captchaApiKey) {
                    await accountPool.markAccountFailed(accountId, 'CAPTCHA required but no API key');
                    return {
                        success: false,
                        shouldRetryDifferentAccount: true,
                        isBalanceError: false,
                        error: 'CAPTCHA required but no API key configured'
                    };
                }

                try {
                    const solver = new CaptchaSolver(captchaApiKey);
                    const solution = await solver.solve(loginResult.captchaImage);

                    const loginWithCaptcha = await client.submitLogin(
                        account.username,
                        account.password,
                        account.totpSecret || undefined,
                        solution
                    );

                    if (!loginWithCaptcha.success) {
                        await accountPool.markAccountFailed(accountId, `CAPTCHA login failed: ${loginWithCaptcha.error}`);
                        return {
                            success: false,
                            shouldRetryDifferentAccount: true,
                            isBalanceError: false,
                            error: `Login with CAPTCHA failed: ${loginWithCaptcha.error}`
                        };
                    }
                } catch (captchaError: any) {
                    await accountPool.markAccountFailed(accountId, `CAPTCHA solve failed: ${captchaError.message}`);
                    return {
                        success: false,
                        shouldRetryDifferentAccount: true,
                        isBalanceError: false,
                        error: `CAPTCHA auto-solve failed: ${captchaError.message}`
                    };
                }
            } else if (!loginResult.success) {
                await accountPool.markAccountFailed(accountId, `Login failed: ${loginResult.error}`);
                return {
                    success: false,
                    shouldRetryDifferentAccount: true,
                    isBalanceError: false,
                    error: `Login failed: ${loginResult.error}`
                };
            }

            // Load packages with session retry
            console.log(`[HTTP] 📦 Loading packages for new account...`);
            const packagesResult = await withSessionRetry(
                client,
                account,
                () => client.loadPackages(operation.cardNumber),
                'loadPackages'
            );

            if (!packagesResult.success) {
                // Check if it's a session error that was already retried
                if (isSessionExpiredError(packagesResult.error)) {
                    await accountPool.markAccountFailed(accountId, `Session error: ${packagesResult.error}`);
                    return {
                        success: false,
                        shouldRetryDifferentAccount: true,
                        isBalanceError: false,
                        error: packagesResult.error
                    };
                }
                throw new Error(packagesResult.error || 'Failed to load packages');
            }

            dealerBalance = packagesResult.dealerBalance;

            // Update account balance in database
            if (dealerBalance !== undefined) {
                await prisma.beinAccount.update({
                    where: { id: accountId },
                    data: {
                        dealerBalance,
                        balanceUpdatedAt: new Date()
                    }
                });
            }
        }

        // ========== DEALER BALANCE CHECK ==========
        if (dealerBalance !== undefined && dealerBalance < selectedPackage.price) {
            console.log(`[HTTP] ❌ INSUFFICIENT DEALER BALANCE: ${dealerBalance} USD < ${selectedPackage.price} USD`);

            // Mark account for cooldown
            await accountPool.markAccountFailed(
                accountId,
                `INSUFFICIENT_BALANCE: ${dealerBalance} < ${selectedPackage.price}`
            );

            // Notify admins
            await notifyAdminLowBalance(
                accountId,
                account.label || account.username,
                dealerBalance,
                selectedPackage.price
            );

            // Release lock before trying another account
            await accountPool.releaseLock(accountId);

            return {
                success: false,
                shouldRetryDifferentAccount: true,
                isBalanceError: true,
                error: `Insufficient balance: ${dealerBalance} < ${selectedPackage.price}`
            };
        }

        // Convert to AvailablePackage format
        const pkg: AvailablePackage = {
            index: selectedPackage.index,
            name: selectedPackage.name,
            price: selectedPackage.price,
            checkboxValue: selectedPackage.checkboxSelector
        };

        // Complete purchase
        console.log(`[HTTP] 📦 Completing purchase: ${pkg.name} @ ${pkg.price} USD`);
        const result = await client.completePurchase(
            pkg,
            operation.promoCode || promoCode,
            operation.stbNumber || undefined,
            true // skipFinalClick - pause for confirmation
        );

        if (result.awaitingConfirm) {
            console.log(`⏸️ [HTTP] Awaiting confirmation for ${operationId}`);

            // Export and save updated session for CONFIRM_PURCHASE
            const updatedSessionData = await client.exportSession();

            // Set heartbeat expiry
            const now = new Date();
            const heartbeatExpiry = new Date(now.getTime() + HEARTBEAT_TTL_SECONDS * 1000);

            await prisma.operation.update({
                where: { id: operationId },
                data: {
                    status: 'AWAITING_FINAL_CONFIRM',
                    finalConfirmExpiry: new Date(Date.now() + 120000),
                    responseMessage: result.message,
                    lastHeartbeat: now,
                    heartbeatExpiry: heartbeatExpiry,
                    responseData: JSON.stringify({
                        sessionData: updatedSessionData,
                        dealerBalance: dealerBalance,
                        savedAt: new Date().toISOString()
                    })
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

            return { success: true, shouldRetryDifferentAccount: false, isBalanceError: false };
        }

        // Direct success (shouldn't happen with skipFinalClick=true)
        if (result.success) {
            await prisma.operation.update({
                where: { id: operationId },
                data: {
                    status: 'COMPLETED',
                    responseMessage: result.message,
                    completedAt: new Date()
                }
            });
            await accountPool.markAccountUsed(accountId);
            return { success: true, shouldRetryDifferentAccount: false, isBalanceError: false };
        }

        // Purchase failed
        throw new Error(result.message);

    } catch (error: any) {
        const errorMessage = error.message || 'Unknown error';
        console.log(`[HTTP] ❌ attemptPurchaseWithAccount failed: ${errorMessage}`);

        // Determine if we should retry with different account
        const isRecoverableError =
            isSessionExpiredError(errorMessage) ||
            errorMessage.includes('CAPTCHA') ||
            errorMessage.includes('login') ||
            errorMessage.includes('Login') ||
            errorMessage.includes('balance') ||
            errorMessage.includes('Balance') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('network');

        if (isRecoverableError) {
            try {
                await accountPool.releaseLock(accountId);
            } catch { /* ignore */ }
        }

        return {
            success: false,
            shouldRetryDifferentAccount: isRecoverableError,
            isBalanceError: false,
            error: errorMessage
        };
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
            stbNumber: true,  // CRITICAL: Need for confirmPurchase
            cardNumber: true, // OPTIMIZATION: Need for cache invalidation
            finalConfirmExpiry: true,
            responseData: true  // CRITICAL: Need this for session restoration
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
        where: { id: operation.beinAccountId },
        include: { proxy: true }  // CRITICAL: Include proxy for HTTP client
    });
    if (!account) throw new Error('Account not found');

    const client = await getHttpClient(account);

    // CRITICAL: Set STB number on client for confirmPurchase
    if (operation.stbNumber) {
        client.setSTBNumber(operation.stbNumber);
        console.log(`[HTTP] 📺 STB number set on client: ${operation.stbNumber}`);
    } else {
        console.warn('[HTTP] ⚠️ No STB number found in operation!');
    }

    // CRITICAL: Restore session from database (cross-worker support)
    // Without this, the ViewState and cookies are missing and purchase fails silently!
    if (operation.responseData) {
        try {
            const savedData = JSON.parse(operation.responseData as string);

            // AUDIT FIX 4.2: Use helper function for session age validation
            if (savedData.savedAt) {
                validateSessionAge(savedData.savedAt, 'confirmPurchase');
            }

            if (savedData.sessionData) {
                console.log(`[HTTP] 🔄 Restoring session for CONFIRM_PURCHASE (saved at ${savedData.savedAt})`);
                await client.importSession(savedData.sessionData);
                console.log(`[HTTP] ✅ Session restored: ViewState=${savedData.sessionData.viewState?.__VIEWSTATE?.length || 0} chars`);
            }
        } catch (parseError: any) {
            if (parseError.message?.includes('انتهت صلاحية')) {
                throw parseError; // Re-throw session expiry error
            }
            console.error('[HTTP] ⚠️ Failed to parse saved session for confirm:', parseError);
            throw new Error('Session restoration failed - cannot confirm purchase');
        }
    } else {
        console.error('[HTTP] ❌ No saved session found - cannot confirm purchase');
        throw new Error('No session data available - cannot confirm purchase');
    }

    const result = await client.confirmPurchase();

    const selectedPackage = operation.selectedPackage as { name: string } | null;

    if (result.success) {
        // OPTIMIZATION: Invalidate package cache since packages changed after purchase
        if (operation.cardNumber) {
            await invalidatePackageCache(operation.cardNumber);
        }

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

        // Track activity for user engagement metrics
        if (operation.userId) {
            await trackOperationComplete(
                operation.userId,
                operationId,
                'RENEW',
                operation.amount,
                { packageName: selectedPackage?.name }
            );
        }

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
                where: { id: operation.beinAccountId },
                include: { proxy: true }  // Include proxy for HTTP client
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

        if (!existingRefund && operation.userId) {
            await prisma.$transaction(async (tx) => {
                const user = await tx.user.findUnique({
                    where: { id: operation.userId! },
                    select: { balance: true }
                });

                if (user) {
                    const newBalance = user.balance + operation.amount!;
                    await tx.user.update({
                        where: { id: operation.userId! },
                        data: { balance: newBalance }
                    });
                    await tx.transaction.create({
                        data: {
                            userId: operation.userId!,
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
 * SIGNAL_REFRESH - Login, check card status, activate signal
 */
async function handleSignalRefreshHttp(
    operationId: string,
    cardNumber: string,
    accountPool: AccountPoolManager
): Promise<void> {
    console.log(`🔄 [HTTP] Starting signal refresh for ${operationId}`);

    await checkIfCancelled(operationId);

    // Update status
    await prisma.operation.update({
        where: { id: operationId },
        data: { status: 'PROCESSING' }
    });

    // Acquire account using queue-based system (with wait if busy)
    const queueManager = getQueueManager(accountPool);
    const queueResult = await queueManager.acquireAccountWithQueue(operationId, 0, 120_000);

    if (!queueResult.account) {
        if (queueResult.timedOut) {
            throw new Error('NO_AVAILABLE_ACCOUNTS: لا توجد حسابات متاحة - انتهت مهلة الانتظار في الطابور');
        }
        throw new Error(queueResult.error || 'NO_AVAILABLE_ACCOUNTS: لا توجد حسابات متاحة');
    }

    const account = queueResult.account;
    if (queueResult.waitTimeMs > 0) {
        console.log(`[HTTP] Operation ${operationId} waited ${Math.round(queueResult.waitTimeMs / 1000)}s in queue`);
    }
    console.log(`✅ Selected account: ${account.label || account.username} (ID: ${account.id})`);

    // Store account reference
    await prisma.operation.update({
        where: { id: operationId },
        data: { beinAccountId: account.id }
    });

    // Get or create HTTP client for this account (includes session restore from Redis)
    const httpClient = await getHttpClient(account);

    try {
        // Step 1: Login with session caching (like other handlers)
        let needsFreshLogin = true;

        // Check if we already have a valid session from Redis cache
        if (httpClient.isSessionActive()) {
            console.log(`[HTTP] ✅ Using cached session for ${account.username}`);
            needsFreshLogin = false;
        }

        if (needsFreshLogin) {
            // Try to acquire login lock to prevent race conditions
            const lockAcquired = await acquireLoginLock(account.id, WORKER_ID);

            if (!lockAcquired) {
                // Another worker is logging in, wait for it to complete
                console.log(`[HTTP] ⏳ Another worker is logging in, waiting...`);
                const loginCompleted = await waitForLoginComplete(account.id);

                if (loginCompleted) {
                    // Try to get the session from cache now
                    const cachedSession = await getSessionFromCache(account.id);
                    if (cachedSession) {
                        await httpClient.importSession(cachedSession);
                        httpClient.markSessionValidFromCache(cachedSession.expiresAt);
                        console.log(`[HTTP] ✅ Got session from cache after waiting`);
                        needsFreshLogin = false;
                    }
                }
            }
        }

        if (needsFreshLogin) {
            const loginResult = await httpClient.login(account.username, account.password, account.totpSecret || undefined);

            if (loginResult.requiresCaptcha && loginResult.captchaImage) {
                console.log(`🧩 [HTTP] CAPTCHA required for signal refresh ${operationId}`);

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
                        await releaseLoginLock(account.id, WORKER_ID);
                        throw new Error('CAPTCHA_TIMEOUT: لم يتم إدخال كود التحقق');
                    }
                }

                // Submit with CAPTCHA
                const loginWithCaptcha = await httpClient.submitLogin(
                    account.username,
                    account.password,
                    account.totpSecret || undefined,
                    solution
                );

                if (!loginWithCaptcha.success) {
                    await releaseLoginLock(account.id, WORKER_ID);
                    throw new Error(loginWithCaptcha.error || 'Login failed after CAPTCHA');
                }
                console.log('🔑 [HTTP] Login with CAPTCHA successful');
            } else if (!loginResult.success) {
                await releaseLoginLock(account.id, WORKER_ID);
                throw new Error(loginResult.error || 'Login failed');
            } else {
                console.log('🔑 [HTTP] Login successful');
            }

            // Save session to cache after successful login
            try {
                const sessionData = await httpClient.exportSession();
                const sessionTimeout = httpClient.getSessionTimeout();
                await saveSessionToCache(account.id, sessionData, sessionTimeout);
                console.log(`[HTTP] 💾 Session saved to Redis cache (TTL: ${sessionTimeout} min)`);
            } catch (saveError) {
                console.error(`[HTTP] ⚠️ Failed to save session to cache:`, saveError);
            }

            // Release login lock
            await releaseLoginLock(account.id, WORKER_ID);
        }

        await checkIfCancelled(operationId);

        // Step 2: Activate signal
        const signalResult = await httpClient.activateSignal(cardNumber);

        if (!signalResult.success) {
            throw new Error(signalResult.error || 'Signal activation failed');
        }

        // Store card status in responseData
        await prisma.operation.update({
            where: { id: operationId },
            data: {
                status: 'COMPLETED',
                completedAt: new Date(),
                stbNumber: signalResult.cardStatus?.stbNumber,
                responseMessage: signalResult.activated
                    ? 'Signal activated successfully'
                    : signalResult.message || 'Card status retrieved',
                responseData: {
                    cardStatus: signalResult.cardStatus,
                    activated: signalResult.activated
                }
            }
        });

        // Create success notification
        const op = await prisma.operation.findUnique({
            where: { id: operationId },
            select: { userId: true }
        });

        if (op?.userId) {
            await createNotification({
                userId: op.userId,
                title: 'تم تجديد الإشارة بنجاح',
                message: signalResult.activated
                    ? `تم تجديد الإشارة للكارت ${cardNumber}`
                    : `تم فحص الكارت ${cardNumber}`,
                type: 'info'
            });
        }

        // Mark account as used
        await accountPool.markAccountUsed(account.id);

        console.log(`✅ [HTTP] Signal refresh completed for ${operationId}`);

    } catch (error: any) {
        // Mark account as used even on failure
        await accountPool.markAccountUsed(account.id);
        throw error;
    }
}

/**
 * SIGNAL_CHECK - Step 1: Login, check card status (NO activation)
 * Returns card info for display, saves session for activation step
 */
async function handleSignalCheckHttp(
    operationId: string,
    cardNumber: string,
    accountPool: AccountPoolManager
): Promise<void> {
    console.log(`🔍 [HTTP] Starting signal check for ${operationId}`);

    await checkIfCancelled(operationId);

    // Update status
    await prisma.operation.update({
        where: { id: operationId },
        data: { status: 'PROCESSING' }
    });

    // Acquire account using queue-based system (with wait if busy)
    const queueManager = getQueueManager(accountPool);
    const queueResult = await queueManager.acquireAccountWithQueue(operationId, 0, 120_000);

    if (!queueResult.account) {
        if (queueResult.timedOut) {
            throw new Error('NO_AVAILABLE_ACCOUNTS: لا توجد حسابات متاحة - انتهت مهلة الانتظار في الطابور');
        }
        throw new Error(queueResult.error || 'NO_AVAILABLE_ACCOUNTS: لا توجد حسابات متاحة');
    }

    const account = queueResult.account;
    if (queueResult.waitTimeMs > 0) {
        console.log(`[HTTP] Operation ${operationId} waited ${Math.round(queueResult.waitTimeMs / 1000)}s in queue`);
    }
    console.log(`✅ Selected account: ${account.label || account.username}`);

    // Store account reference
    await prisma.operation.update({
        where: { id: operationId },
        data: { beinAccountId: account.id }
    });

    const httpClient = await getHttpClient(account);

    try {
        // Step 1: Login (with Redis session caching and login locking)
        let needsFreshLogin = true;

        // Check if we already have a valid session from Redis cache
        if (httpClient.isSessionActive()) {
            console.log(`[HTTP] ✅ Using cached session for ${account.username}`);
            needsFreshLogin = false;
        }

        if (needsFreshLogin) {
            // Try to acquire login lock to prevent race conditions
            const lockAcquired = await acquireLoginLock(account.id, WORKER_ID);

            if (!lockAcquired) {
                // Another worker is logging in, wait for it to complete
                console.log(`[HTTP] ⏳ Another worker is logging in, waiting...`);
                const loginCompleted = await waitForLoginComplete(account.id);

                if (loginCompleted) {
                    // Try to get the session from cache now
                    const cachedSession = await getSessionFromCache(account.id);
                    if (cachedSession) {
                        await httpClient.importSession(cachedSession);
                        httpClient.markSessionValidFromCache(cachedSession.expiresAt);
                        console.log(`[HTTP] ✅ Got session from cache after waiting`);
                        needsFreshLogin = false;
                    }
                }
            }
        }

        if (needsFreshLogin) {
            const loginResult = await httpClient.login(account.username, account.password, account.totpSecret || undefined);

            if (loginResult.requiresCaptcha && loginResult.captchaImage) {
                console.log(`🧩 [HTTP] CAPTCHA required for signal check ${operationId}`);

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
                }

                // Fallback to manual if needed
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
                        await releaseLoginLock(account.id, WORKER_ID);
                        throw new Error('CAPTCHA_TIMEOUT: لم يتم إدخال كود التحقق');
                    }
                }

                // Submit with CAPTCHA
                const loginWithCaptcha = await httpClient.submitLogin(
                    account.username,
                    account.password,
                    account.totpSecret || undefined,
                    solution
                );

                if (!loginWithCaptcha.success) {
                    await releaseLoginLock(account.id, WORKER_ID);
                    throw new Error(loginWithCaptcha.error || 'Login failed after CAPTCHA');
                }
            } else if (!loginResult.success) {
                await releaseLoginLock(account.id, WORKER_ID);
                throw new Error(loginResult.error || 'Login failed');
            }

            // Login successful - save session to Redis cache
            try {
                const loginSessionData = await httpClient.exportSession();
                const sessionTimeout = httpClient.getSessionTimeout();
                await saveSessionToCache(account.id, loginSessionData, sessionTimeout);
                console.log(`[HTTP] 💾 Session saved to Redis cache (TTL: ${sessionTimeout} min)`);
            } catch (saveError) {
                console.error(`[HTTP] ⚠️ Failed to save session to cache:`, saveError);
            }

            // Release login lock
            await releaseLoginLock(account.id, WORKER_ID);
        }

        await checkIfCancelled(operationId);

        // Step 2: Check card status ONLY (no activation) - with session retry
        const checkResult = await withSessionRetry(
            httpClient,
            account,
            () => httpClient.checkCardForSignal(cardNumber),
            'checkCardForSignal'
        );

        if (!checkResult.success) {
            throw new Error(checkResult.error || 'Card check failed');
        }

        // Export session for activation step
        const sessionData = await httpClient.exportSession();

        // Store card status and session - await user to click activate
        // Use 'COMPLETED' status with awaitingActivate flag to indicate waiting for user to click activate
        await prisma.operation.update({
            where: { id: operationId },
            data: {
                status: 'COMPLETED',
                stbNumber: checkResult.cardStatus?.stbNumber,
                responseMessage: 'Card checked - ready for activation',
                responseData: JSON.stringify({
                    cardStatus: checkResult.cardStatus,
                    contracts: checkResult.contracts || [], // Include contracts table
                    sessionData: sessionData,
                    awaitingActivate: true,
                    checkedAt: new Date().toISOString()
                })
            }
        });

        // Extend session TTL on successful operation
        await extendSessionTTL(account.id, httpClient.getSessionTimeout());

        await accountPool.markAccountUsed(account.id);
        console.log(`✅ [HTTP] Signal check completed for ${operationId}`);

    } catch (error: any) {
        await accountPool.markAccountUsed(account.id);

        // Delete session from cache on session-related errors
        if (error.message?.includes('Session expired') || error.message?.includes('login')) {
            await deleteSessionFromCache(account.id);
        }

        throw error;
    }
}

/**
 * SIGNAL_ACTIVATE - Step 2: Activate signal (assumes SIGNAL_CHECK was done)
 * Uses saved session to click the Activate button
 */
async function handleSignalActivateHttp(
    operationId: string,
    cardNumber: string,
    accountPool: AccountPoolManager
): Promise<void> {
    console.log(`⚡ [HTTP] Starting signal activation for ${operationId}`);

    await checkIfCancelled(operationId);

    // Get operation with saved session
    const operation = await prisma.operation.findUnique({
        where: { id: operationId },
        select: {
            id: true,
            userId: true,
            beinAccountId: true,
            cardNumber: true,
            responseData: true,
            status: true
        }
    });

    if (!operation) {
        throw new Error('Operation not found');
    }

    // Check that this operation is ready for activation (completed check step)
    const savedData = typeof operation.responseData === 'string'
        ? JSON.parse(operation.responseData)
        : operation.responseData as any;

    if (!savedData?.awaitingActivate) {
        throw new Error(`Operation is not awaiting activation`);
    }

    if (!operation.beinAccountId) {
        throw new Error('No account assigned to operation');
    }

    // Update status
    await prisma.operation.update({
        where: { id: operationId },
        data: { status: 'PROCESSING' }
    });

    // Get account
    const account = await prisma.beinAccount.findUnique({
        where: { id: operation.beinAccountId },
        include: { proxy: true }  // CRITICAL: Include proxy for HTTP client
    });
    if (!account) throw new Error('Account not found');

    const httpClient = await getHttpClient(account);

    try {
        // Session was parsed above as savedData - restore if available
        if (savedData?.sessionData) {
            // AUDIT FIX 4.2: Validate session age for signalActivate flow
            if (savedData.checkedAt) {
                validateSessionAge(savedData.checkedAt, 'signalActivate');
            }

            console.log(`[HTTP] 🔄 Restoring session for activation`);
            await httpClient.importSession(savedData.sessionData);
        }

        // Use card number from operation or parameter
        const targetCardNumber = cardNumber || operation.cardNumber;

        // Activate signal
        const activateResult = await httpClient.activateSignalOnly(targetCardNumber);

        if (!activateResult.success) {
            throw new Error(activateResult.error || 'Activation failed');
        }

        // Update operation with result
        await prisma.operation.update({
            where: { id: operationId },
            data: {
                status: 'COMPLETED',
                completedAt: new Date(),
                responseMessage: activateResult.activated
                    ? 'تم تفعيل الإشارة بنجاح'
                    : activateResult.message || 'لم يتم التفعيل',
                responseData: JSON.stringify({
                    ...savedData,
                    cardStatus: activateResult.cardStatus,
                    activated: activateResult.activated,
                    awaitingActivate: false,  // Clear the flag
                    activatedAt: new Date().toISOString()
                })
            }
        });

        // Create notification
        if (operation.userId) {
            await createNotification({
                userId: operation.userId,
                title: activateResult.activated ? 'تم تفعيل الإشارة' : 'لم يتم التفعيل',
                message: activateResult.activated
                    ? `تم تفعيل الإشارة للكارت ${targetCardNumber}`
                    : activateResult.error || 'حدث خطأ في التفعيل',
                type: activateResult.activated ? 'success' : 'warning'
            });
        }

        await accountPool.markAccountUsed(account.id);
        console.log(`✅ [HTTP] Signal activation completed for ${operationId}: activated=${activateResult.activated}`);

    } catch (error: any) {
        await accountPool.markAccountUsed(account.id);
        throw error;
    }
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
 * CHECK_ACCOUNT_BALANCE - Fetch dealer balance for admin display
 * This is called from the admin panel to update account balance
 */
async function handleCheckAccountBalance(accountId: string): Promise<void> {
    console.log(`💰 [HTTP] Checking balance for account ${accountId}`);

    // Get account with proxy
    const account = await prisma.beinAccount.findUnique({
        where: { id: accountId },
        include: { proxy: true }
    });

    if (!account) {
        throw new Error(`Account ${accountId} not found`);
    }

    if (!account.isActive) {
        throw new Error(`Account ${accountId} is not active`);
    }

    // Get or create HTTP client
    const client = await getHttpClient(account);

    // Reload config
    await client.reloadConfig();

    // Login if needed
    if (!client.isSessionActive()) {
        console.log(`[HTTP] Logging in to fetch balance...`);
        const loginResult = await client.login(
            account.username,
            account.password,
            account.totpSecret || undefined
        );

        if (!loginResult.success) {
            throw new Error(loginResult.error || 'Login failed');
        }

        // Save session to cache
        try {
            const sessionData = await client.exportSession();
            const sessionTimeout = client.getSessionTimeout();
            await saveSessionToCache(account.id, sessionData, sessionTimeout);
        } catch (saveError) {
            console.error('[HTTP] Failed to save session:', saveError);
        }
    }

    // Use a test card number or fetch balance from dashboard
    // For simplicity, we'll try to get the balance from the packages page
    // using a dummy approach - we need any card number to access the page

    // Get a recent successful card number from this account's operations
    const recentOp = await prisma.operation.findFirst({
        where: {
            beinAccountId: accountId,
            status: 'COMPLETED',
            cardNumber: { not: '' }
        },
        orderBy: { completedAt: 'desc' },
        select: { cardNumber: true }
    });

    const testCardNumber = recentOp?.cardNumber || '0000000000';

    console.log(`[HTTP] Fetching balance using card: ${testCardNumber}`);

    // Fetch dealer balance
    const balanceResult = await client.fetchDealerBalance(testCardNumber);

    if (balanceResult.success && balanceResult.balance !== null) {
        // Update the account with the new balance
        await prisma.beinAccount.update({
            where: { id: accountId },
            data: {
                dealerBalance: balanceResult.balance,
                balanceUpdatedAt: new Date()
            }
        });
        console.log(`✅ [HTTP] Balance updated: ${balanceResult.balance} USD`);
    } else {
        console.log(`⚠️ [HTTP] Could not fetch balance: ${balanceResult.error}`);
        throw new Error(balanceResult.error || 'Failed to fetch balance');
    }
}

// =============================================
// MONTHLY INSTALLMENT HANDLERS
// =============================================

/**
 * START_INSTALLMENT - Login, check card, load installment details
 * 
 * Flow:
 * 1. Acquire beIN account from pool
 * 2. Login with session caching
 * 3. Load installment details (select CISCO, enter card, load)
 * 4. Set status to AWAITING_INSTALLMENT_CONFIRM if installment found
 */
async function handleStartInstallmentHttp(
    operationId: string,
    cardNumber: string,
    accountPool: AccountPoolManager
): Promise<void> {
    console.log(`🚀 [HTTP] Starting installment load for ${operationId}`);

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

    // Get next available account with queue-based retry
    const queueManager = getQueueManager(accountPool);
    const queueResult = await queueManager.acquireAccountWithQueue(operationId, 0, 120_000);

    if (!queueResult.account) {
        if (queueResult.timedOut) {
            throw new Error('NO_AVAILABLE_ACCOUNTS: لا توجد حسابات متاحة - انتهت مهلة الانتظار في الطابور');
        }
        throw new Error(queueResult.error || 'NO_AVAILABLE_ACCOUNTS: لا توجد حسابات متاحة');
    }

    const selectedAccount = queueResult.account;
    if (queueResult.waitTimeMs > 0) {
        console.log(`[HTTP] Operation ${operationId} waited ${Math.round(queueResult.waitTimeMs / 1000)}s in queue`);
    }

    await prisma.operation.update({
        where: { id: operationId },
        data: { beinAccountId: selectedAccount.id }
    });

    console.log(`🔑 [HTTP] Using account: ${selectedAccount.label || selectedAccount.username}`);

    // Get HTTP client for this account
    const client = await getHttpClient(selectedAccount);
    await client.reloadConfig();

    await checkIfCancelled(operationId);

    // Step 1: Login (with session caching)
    let needsFreshLogin = !client.isSessionActive();

    if (needsFreshLogin) {
        const lockAcquired = await acquireLoginLock(selectedAccount.id, WORKER_ID);

        if (!lockAcquired) {
            console.log(`[HTTP] ⏳ Another worker is logging in, waiting...`);
            const loginCompleted = await waitForLoginComplete(selectedAccount.id);

            if (loginCompleted) {
                const cachedSession = await getSessionFromCache(selectedAccount.id);
                if (cachedSession) {
                    await client.importSession(cachedSession);
                    client.markSessionValidFromCache(cachedSession.expiresAt);
                    console.log(`[HTTP] ✅ Got session from cache after waiting`);
                    needsFreshLogin = false;
                }
            }
        }
    }

    if (needsFreshLogin) {
        const loginResult = await client.login(
            selectedAccount.username,
            selectedAccount.password,
            selectedAccount.totpSecret || undefined
        );

        // Handle CAPTCHA if needed (similar to renewal)
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
            }

            // Fallback to manual if auto-solve failed
            if (!solution) {
                const now = new Date();
                const heartbeatExpiry = new Date(now.getTime() + HEARTBEAT_TTL_SECONDS * 1000);

                await prisma.operation.update({
                    where: { id: operationId },
                    data: {
                        status: 'AWAITING_CAPTCHA',
                        captchaImage: loginResult.captchaImage,
                        captchaExpiry: new Date(Date.now() + CAPTCHA_TIMEOUT_MS),
                        lastHeartbeat: now,
                        heartbeatExpiry: heartbeatExpiry
                    }
                });

                solution = await waitForCaptchaSolution(operationId);
                if (!solution) {
                    await releaseLoginLock(selectedAccount.id, WORKER_ID);
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
                await releaseLoginLock(selectedAccount.id, WORKER_ID);
                throw new Error(loginWithCaptcha.error || 'Login failed after CAPTCHA');
            }
        } else if (!loginResult.success) {
            await releaseLoginLock(selectedAccount.id, WORKER_ID);
            throw new Error(loginResult.error || 'Login failed');
        }

        // Save session to cache
        try {
            const sessionData = await client.exportSession();
            const sessionTimeout = client.getSessionTimeout();
            await saveSessionToCache(selectedAccount.id, sessionData, sessionTimeout);
            console.log(`[HTTP] 💾 Session saved to Redis cache`);
        } catch (saveError) {
            console.error('[HTTP] Failed to save session to cache:', saveError);
        }

        await releaseLoginLock(selectedAccount.id, WORKER_ID);
    }

    await checkIfCancelled(operationId);

    // Step 2: Load installment details
    console.log(`[HTTP] Loading installment for card ${cardNumber}`);

    const installmentResult = await client.loadInstallment(cardNumber);

    if (!installmentResult.success) {
        throw new Error(installmentResult.error || 'Failed to load installment');
    }

    if (!installmentResult.hasInstallment) {
        // No installment found - complete with message
        await prisma.operation.update({
            where: { id: operationId },
            data: {
                status: 'COMPLETED',
                responseMessage: 'لا توجد أقساط لهذا الكارت',
                completedAt: new Date()
            }
        });

        // Release account
        await accountPool.markAccountUsed(selectedAccount.id);
        return;
    }

    // Installment found - save details and wait for user confirmation
    const now = new Date();
    const confirmExpiry = new Date(now.getTime() + 60_000); // 60 seconds to confirm
    const heartbeatExpiry = new Date(now.getTime() + HEARTBEAT_TTL_SECONDS * 1000);

    await prisma.operation.update({
        where: { id: operationId },
        data: {
            status: 'AWAITING_FINAL_CONFIRM',
            // Store installment data in responseData
            responseData: JSON.stringify({
                installment: installmentResult.installment || null,
                subscriber: installmentResult.subscriber || null,
                dealerBalance: installmentResult.dealerBalance || null,
                isInstallment: true // Flag to identify installment operations
            }),
            stbNumber: installmentResult.subscriber?.stbModel || null,
            amount: installmentResult.installment?.dealerPrice || 0,
            finalConfirmExpiry: confirmExpiry,
            lastHeartbeat: now,
            heartbeatExpiry: heartbeatExpiry
        }
    });

    console.log(`✅ [HTTP] Installment loaded, awaiting confirmation`);
    console.log(`   Package: ${installmentResult.installment?.package}`);
    console.log(`   Dealer Price: ${installmentResult.installment?.dealerPrice} USD`);
}

/**
 * CONFIRM_INSTALLMENT - Execute payment after user confirms
 */
async function handleConfirmInstallmentHttp(
    operationId: string,
    cardNumber: string,
    accountPool: AccountPoolManager
): Promise<void> {
    console.log(`💰 [HTTP] Confirming installment payment for ${operationId}`);

    await checkIfCancelled(operationId);

    // Get operation with account
    const operation = await prisma.operation.findUnique({
        where: { id: operationId },
        include: {
            beinAccount: { include: { proxy: true } },
            user: { select: { id: true } }
        }
    });

    if (!operation?.beinAccount) {
        throw new Error('No beIN account assigned to this operation');
    }

    const selectedAccount = operation.beinAccount;

    // Get HTTP client
    const client = await getHttpClient(selectedAccount);
    await client.reloadConfig();

    // Ensure session is active — re-login if expired
    if (!client.isSessionActive()) {
        console.log(`[HTTP] ⚠️ Session expired for installment confirm, re-logging in...`);

        // Try to get session from cache first
        const cachedSession = await getSessionFromCache(selectedAccount.id);
        if (cachedSession) {
            await client.importSession(cachedSession);
            client.markSessionValidFromCache(cachedSession.expiresAt);
            console.log(`[HTTP] ✅ Got session from cache`);
        } else {
            // Fresh login
            const loginResult = await client.login(
                selectedAccount.username,
                selectedAccount.password,
                selectedAccount.totpSecret || undefined
            );
            if (!loginResult.success) {
                throw new Error(loginResult.error || 'Login failed for installment confirm');
            }
            // Save session to cache
            try {
                const sessionData = await client.exportSession();
                const sessionTimeout = client.getSessionTimeout();
                await saveSessionToCache(selectedAccount.id, sessionData, sessionTimeout);
            } catch (saveError) {
                console.error('[HTTP] Failed to save session to cache:', saveError);
            }
        }
    }

    await checkIfCancelled(operationId);

    // Re-load installment to ensure card is loaded and ViewState is fresh
    console.log(`[HTTP] Re-loading installment for card ${cardNumber} before payment...`);
    const loadResult = await client.loadInstallment(cardNumber);

    if (!loadResult.success || !loadResult.hasInstallment) {
        // If reload fails, refund user
        if (operation.userId && operation.amount) {
            await refundUser(operationId, operation.userId, operation.amount, loadResult.error || 'Failed to re-load installment');
        }
        throw new Error(loadResult.error || 'Failed to re-load installment before payment');
    }

    await checkIfCancelled(operationId);

    // Execute payment
    console.log(`[HTTP] Executing installment payment...`);
    const payResult = await client.payInstallment();

    if (!payResult.success) {
        // Payment failed - refund user
        if (operation.userId && operation.amount) {
            await refundUser(operationId, operation.userId, operation.amount, payResult.message);
        }
        throw new Error(payResult.message);
    }

    // Payment successful
    await prisma.operation.update({
        where: { id: operationId },
        data: {
            status: 'COMPLETED',
            responseMessage: payResult.message,
            completedAt: new Date(),
            finalConfirmExpiry: null
        }
    });

    // Release account
    await accountPool.markAccountUsed(selectedAccount.id);

    // Track activity for user engagement metrics
    if (operation.userId) {
        await trackOperationComplete(
            operation.userId,
            operationId,
            'RENEW', // Use RENEW type for statistics
            operation.amount,
            { type: 'installment', cardNumber }
        );
    }

    // Create notification
    if (operation.userId) {
        await createNotification({
            userId: operation.userId,
            title: 'تم دفع القسط',
            message: `تم دفع قسط الكارت ${cardNumber} بنجاح`,
            type: 'success',
            link: '/dashboard/history'
        });
    }

    console.log(`✅ [HTTP] Installment payment completed`);
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

/**
 * Get the httpClients map for external use (e.g., SessionKeepAlive)
 */
export function getHttpClientsMap(): Map<string, HttpClientService> {
    return httpClients;
}
