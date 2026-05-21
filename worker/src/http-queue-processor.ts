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
import { HttpClientService, AvailablePackage, classifyFinalPayOutcome } from './http';
import type { FinalPayOutcomeCategory, PayInstallmentResult, PurchaseResult } from './http';
import { AccountPoolManager, AccountQueueManager, getQueueManager, forceUnlockAccount, lockAccount, unlockAccount } from './pool';
import { refundUser, markOperationFailed } from './utils/error-handler';
import { createNotification, notifyAdminLowBalance, checkAndNotifyLowBalance } from './utils/notification';
import { CaptchaSolver } from './utils/captcha-solver';
import { BeinAccount, OperationStatus, Prisma, Proxy } from '@prisma/client';
import { ProxyConfig } from './types/proxy';
import { trackOperationComplete } from './lib/activity-tracker';
import { detectAndRecordOperationIntegrity } from './lib/integrity-detector';
import { decryptAccountPassword } from './lib/crypto';
import { recordConfirmedBeinSpend } from './lib/bein-spend-ledger';
import {
    getSessionFromCache,
    saveSessionToCache,
    deleteSessionFromCache,
    saveOperationSessionToCache,
    getOperationSessionFromCache,
    deleteOperationSessionFromCache,
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
import {
    recordLoginFailure,
    recordLoginSuccess,
    shouldCountAsCredentialFailure,
} from './lib/bein-login-tracking';

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
    smartcardType?: string;  // 'CISCO' or 'IRDETO' (default: CISCO)
}

// Custom error for cancelled operations
class OperationCancelledError extends Error {
    constructor(operationId: string) {
        super(`Operation ${operationId} was cancelled`);
        this.name = 'OperationCancelledError';
    }
}

const TERMINAL_STATUS_LIST: OperationStatus[] = [
    OperationStatus.COMPLETED,
    OperationStatus.REVIEW_REQUIRED,
    OperationStatus.CANCELLED,
    OperationStatus.FAILED,
    OperationStatus.EXPIRED
];

const TERMINAL_STATUSES = new Set<string>(TERMINAL_STATUS_LIST);

function isTerminalStatus(status: string | null | undefined): boolean {
    return !!status && TERMINAL_STATUSES.has(status);
}

function getOperationPhase(responseData: unknown): string | null {
    const data = parseResponseDataObject(responseData);
    const phase = data.operationPhase ?? data.phase;
    return typeof phase === 'string' ? phase : null;
}

function mergeOperationPhaseData(
    responseData: unknown,
    evidence: {
        operationPhase: string;
        jobType: string;
        finalPaySubmitted?: boolean;
        finalPaySubmittedAt?: string;
        dealerBalanceBefore?: number | null;
        dealerBalanceAfter?: number | null;
    }
): Prisma.InputJsonObject {
    return {
        ...parseResponseDataObject(responseData),
        ...evidence
    };
}

function hasFinalPaymentStarted(
    status: OperationStatus | string | null | undefined,
    responseData?: unknown
): boolean {
    const data = parseResponseDataObject(responseData);
    const phase = getOperationPhase(responseData);

    if (data.finalPaySubmitted === true) return true;
    if (phase === 'FINAL_PAY_SUBMITTED' || phase === 'POST_FINAL_PAY_REVIEW') return true;
    if (
        phase === 'PACKAGE_PREPARATION' ||
        phase === 'CANCELLATION_CONFIRM' ||
        phase === 'FINAL_CONFIRMATION' ||
        phase === 'FINAL_CONFIRMATION_REQUESTED'
    ) {
        return false;
    }

    return status === OperationStatus.COMPLETING;
}

async function updateOperationIfActive(
    operationId: string,
    data: Prisma.OperationUncheckedUpdateManyInput,
    context: string
): Promise<boolean> {
    const updated = await prisma.operation.updateMany({
        where: {
            id: operationId,
            status: { notIn: TERMINAL_STATUS_LIST }
        },
        data
    });

    if (updated.count > 0) return true;

    const current = await prisma.operation.findUnique({
        where: { id: operationId },
        select: { status: true }
    });
    console.log(`[HTTP] Skipping ${context} for ${operationId}; current status is ${current?.status || 'missing'}`);
    return false;
}

function getErrMsg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isAmbiguousFailure(message: string | null | undefined): boolean {
    if (!message) return false;
    const normalized = message.toLowerCase();
    return normalized.includes('transaction status unknown') ||
        normalized.includes('status unknown') ||
        normalized.includes('please check balance');
}

interface FinalPayRefundDecision {
    outcomeCategory: FinalPayOutcomeCategory;
    refundSafe: boolean;
    reviewRequired: boolean;
    reason: string;
}

function decideFinalPayRefundSafety(
    result: PurchaseResult | PayInstallmentResult,
    finalPaySubmitted: boolean
): FinalPayRefundDecision {
    const outcomeCategory = result.outcomeCategory ?? classifyFinalPayOutcome({
        success: result.success,
        message: result.message,
        finalPaySubmitted: result.finalPaySubmitted ?? finalPaySubmitted,
        beinBalanceBefore: result.beinBalanceBefore,
        beinBalanceAfter: result.beinBalanceAfter
    });

    // Business rule: after final Pay, unknown means review, not refund.
    return {
        outcomeCategory,
        refundSafe: outcomeCategory === 'CONFIRMED_NOT_CHARGED',
        reviewRequired: outcomeCategory === 'UNCERTAIN_REVIEW_REQUIRED',
        reason: result.message
    };
}

interface OperationAuditSnapshot {
    beinAccountId: string | null;
    beinUsername: string | null;
    beinBalanceBefore: number | null;
    beinBalanceAfter: number | null;
    beinDelta: number | null;
    userId: string | null;
    userDeductTotal: number;
    userBalanceBefore: number | null;
    userBalanceAfter: number | null;
    capturedAt: string;
    outcomeCategory?: FinalPayOutcomeCategory;
    reviewReason?: string;
    reviewSource?: string;
    refundBlocked?: boolean;
    chargedBeinLedgerId?: string;
}

function toNullableNumber(value: unknown): number | null {
    return typeof value === 'number' && !Number.isNaN(value) ? value : null;
}

function parseResponseDataObject(responseData: unknown): Record<string, unknown> {
    if (!responseData) return {};
    if (typeof responseData === 'string') {
        try {
            const parsed = JSON.parse(responseData);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }
    if (typeof responseData === 'object') {
        return responseData as Record<string, unknown>;
    }
    return {};
}

async function buildOperationAuditSnapshot(params: {
    operationId: string;
    userId: string | null;
    beinAccountId: string | null;
    beinUsername: string | null;
    beinBalanceBefore: number | null;
    beinBalanceAfter: number | null;
    outcomeCategory?: FinalPayOutcomeCategory;
    reviewReason?: string;
    reviewSource?: string;
    refundBlocked?: boolean;
    chargedBeinLedgerId?: string;
}): Promise<OperationAuditSnapshot> {
    const {
        operationId,
        userId,
        beinAccountId,
        beinUsername,
        beinBalanceBefore,
        beinBalanceAfter,
        outcomeCategory,
        reviewReason,
        reviewSource,
        refundBlocked,
        chargedBeinLedgerId
    } = params;

    const [deductionAgg, latestDeduction] = await Promise.all([
        prisma.transaction.aggregate({
            where: {
                operationId,
                type: 'OPERATION_DEDUCT'
            },
            _sum: { amount: true }
        }),
        prisma.transaction.findFirst({
            where: {
                operationId,
                type: 'OPERATION_DEDUCT'
            },
            orderBy: { createdAt: 'desc' },
            select: { balanceAfter: true }
        })
    ]);

    const userDeductTotal = Math.abs(deductionAgg._sum.amount || 0);
    const userBalanceAfter = toNullableNumber(latestDeduction?.balanceAfter);
    const userBalanceBefore =
        userBalanceAfter === null
            ? null
            : userBalanceAfter + userDeductTotal;

    const before = toNullableNumber(beinBalanceBefore);
    const after = toNullableNumber(beinBalanceAfter);
    const beinDelta =
        before === null || after === null
            ? null
            : before - after;

    const snapshot: OperationAuditSnapshot = {
        beinAccountId,
        beinUsername,
        beinBalanceBefore: before,
        beinBalanceAfter: after,
        beinDelta,
        userId,
        userDeductTotal,
        userBalanceBefore,
        userBalanceAfter,
        capturedAt: new Date().toISOString()
    };
    if (outcomeCategory !== undefined) snapshot.outcomeCategory = outcomeCategory;
    if (reviewReason !== undefined) snapshot.reviewReason = reviewReason;
    if (reviewSource !== undefined) snapshot.reviewSource = reviewSource;
    if (refundBlocked !== undefined) snapshot.refundBlocked = refundBlocked;
    if (chargedBeinLedgerId !== undefined) snapshot.chargedBeinLedgerId = chargedBeinLedgerId;
    return snapshot;
}

async function persistOperationAuditSnapshot(
    operationId: string,
    responseData: unknown,
    snapshot: OperationAuditSnapshot
): Promise<void> {
    const base = parseResponseDataObject(responseData);
    delete base.sessionData;
    const existingAudit =
        typeof base.auditSnapshot === 'object' && base.auditSnapshot
            ? base.auditSnapshot as Record<string, unknown>
            : {};

    const merged = {
        ...base,
        auditSnapshot: {
            ...existingAudit,
            ...snapshot
        }
    };

    await prisma.operation.update({
        where: { id: operationId },
        data: {
            responseData: typeof responseData === 'string' ? JSON.stringify(merged) : merged
        }
    });
}

function getLegacySessionData(responseData: unknown): Record<string, unknown> | null {
    const data = parseResponseDataObject(responseData);
    return data.sessionData && typeof data.sessionData === 'object'
        ? data.sessionData as Record<string, unknown>
        : null;
}

async function restoreOperationSession(
    operationId: string,
    responseData: unknown,
    client: HttpClientService
): Promise<boolean> {
    const cachedSession = await getOperationSessionFromCache(operationId);
    if (cachedSession) {
        await client.importSession(cachedSession);
        client.markSessionValidFromCache(cachedSession.expiresAt);
        return true;
    }

    const legacySession = getLegacySessionData(responseData);
    if (legacySession) {
        await client.importSession(legacySession as unknown as Parameters<typeof client.importSession>[0]);
        const expiresAt = typeof legacySession.expiresAt === 'number' ? legacySession.expiresAt : undefined;
        client.markSessionValidFromCache(expiresAt);
        return true;
    }

    return false;
}

// Worker ID for login locking (unique per process)
const WORKER_ID = `worker-${process.pid}-${Date.now()}`;

/**
 * Shared Redis sessions should only carry cookies and expiry metadata.
 * ViewState is operation-specific and must not be reused across flows.
 */
function prepareSharedSessionForCache<T extends { viewState?: unknown }>(sessionData: T): T {
    sessionData.viewState = undefined;
    return sessionData;
}

/**
 * Create a fresh HTTP client for a single operation.
 * Each operation gets its own CookieJar/ViewState chain while still
 * cloning cookies from the shared Redis session when available.
 */
async function createOperationClient(account: BeinAccount & { proxy?: Proxy | null }): Promise<HttpClientService> {
    let proxyConfig: ProxyConfig | undefined;
    if (account.proxy) {
        proxyConfig = {
            host: account.proxy.host,
            port: account.proxy.port,
            username: account.proxy.username,
            password: account.proxy.password
        };
    }

    const client = new HttpClientService(proxyConfig);
    await client.initialize();
    console.log(`[HTTP] Created operation client for ${account.username}${proxyConfig ? ` with proxy ${proxyConfig.host}:${proxyConfig.port}` : ' without proxy'}`);

    try {
        const cachedSession = await getSessionFromCache(account.id);
        if (cachedSession) {
            await client.importSession(cachedSession);
            client.markSessionValidFromCache(cachedSession.expiresAt);
            const expiryText = typeof cachedSession.expiresAt === 'number'
                ? new Date(cachedSession.expiresAt).toISOString()
                : 'unknown';
            console.log(`[HTTP] Cloned shared session for ${account.username} (expires: ${expiryText})`);
        } else {
            console.log(`[HTTP] No cached session for ${account.username}; will login fresh`);
        }
    } catch {
        console.log(`[HTTP] Failed to restore cached session for ${account.username}; will login fresh`);
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

async function trackCredentialLoginFailure(accountId: string, reason: string | undefined): Promise<void> {
    if (shouldCountAsCredentialFailure(reason)) {
        await recordLoginFailure(accountId, reason);
    }
}

async function trackFreshLoginSuccess(accountId: string): Promise<void> {
    await recordLoginSuccess(accountId);
}

/**
 * Perform re-login with CAPTCHA handling and retry logic
 * Retries up to MAX_LOGIN_RETRIES times before giving up.
 * Each failure is recorded (consecutive counter increments).
 * On success, the counter resets to 0.
 * After threshold consecutive failures, the account is auto-disabled.
 * 
 * @returns true if login successful, false otherwise
 */
const MAX_LOGIN_RETRIES = 3;
const LOGIN_RETRY_DELAY_MS = 2000;

async function performReLogin(
    httpClient: HttpClientService,
    account: BeinAccount & { proxy?: Proxy | null },
    operationName: string
): Promise<boolean> {
    let lastError: string = 'Login failed';

    for (let attempt = 1; attempt <= MAX_LOGIN_RETRIES; attempt++) {
        try {
            console.log(`[HTTP] 🔑 Login attempt ${attempt}/${MAX_LOGIN_RETRIES} for ${account.username} (${operationName})`);

            // Clear cached session on first attempt only
            if (attempt === 1) {
                await deleteSessionFromCache(account.id);
                httpClient.invalidateSession();
            }

            // Perform fresh login
            const loginResult = await httpClient.login(
                account.username,
                account.password,
                account.totpSecret || undefined
            );

            if (loginResult.requiresCaptcha && loginResult.captchaImage) {
                // Try 2Captcha auto-solve
                console.log(`[HTTP] 🧩 CAPTCHA required during login attempt ${attempt}, attempting auto-solve...`);
                const captchaApiKey = await getCaptchaApiKey();

                if (captchaApiKey) {
                    try {
                        const captchaSolver = new CaptchaSolver(captchaApiKey);
                        const solution = await captchaSolver.solve(loginResult.captchaImage);
                        console.log('[HTTP] ✅ CAPTCHA auto-solved: [REDACTED]');

                        // Submit login with CAPTCHA solution
                        const loginWithCaptcha = await httpClient.submitLogin(
                            account.username,
                            account.password,
                            account.totpSecret || undefined,
                            solution
                        );

                        if (!loginWithCaptcha.success) {
                            lastError = loginWithCaptcha.error || 'Login failed after CAPTCHA';
                            await trackCredentialLoginFailure(account.id, lastError);
                            console.log(`[HTTP] ❌ Attempt ${attempt}/${MAX_LOGIN_RETRIES} failed: ${lastError}`);

                            if (attempt < MAX_LOGIN_RETRIES) {
                                console.log(`[HTTP] ⏳ Retrying in ${LOGIN_RETRY_DELAY_MS}ms...`);
                                await new Promise(resolve => setTimeout(resolve, LOGIN_RETRY_DELAY_MS));
                            }
                            continue; // Try next attempt
                        }

                        console.log(`[HTTP] ✅ Login with CAPTCHA successful on attempt ${attempt}`);
                    } catch (captchaError: unknown) {
                        lastError = `CAPTCHA auto-solve failed: ${getErrMsg(captchaError)}`;
                        console.log(`[HTTP] ❌ Attempt ${attempt}/${MAX_LOGIN_RETRIES}: ${lastError}`);

                        if (attempt < MAX_LOGIN_RETRIES) {
                            console.log(`[HTTP] ⏳ Retrying in ${LOGIN_RETRY_DELAY_MS}ms...`);
                            await new Promise(resolve => setTimeout(resolve, LOGIN_RETRY_DELAY_MS));
                        }
                        continue; // Try next attempt
                    }
                } else {
                    lastError = 'Re-login requires CAPTCHA but no API key configured';
                    // Don't retry for missing API key — won't change between attempts
                    throw new Error(lastError);
                }
            } else if (!loginResult.success) {
                lastError = loginResult.error || 'Login failed';
                await trackCredentialLoginFailure(account.id, lastError);
                console.log(`[HTTP] ❌ Attempt ${attempt}/${MAX_LOGIN_RETRIES} failed: ${lastError}`);

                if (attempt < MAX_LOGIN_RETRIES) {
                    console.log(`[HTTP] ⏳ Retrying in ${LOGIN_RETRY_DELAY_MS}ms...`);
                    await new Promise(resolve => setTimeout(resolve, LOGIN_RETRY_DELAY_MS));
                }
                continue; // Try next attempt
            }

            // === LOGIN SUCCESS ===
            await trackFreshLoginSuccess(account.id);

            // Save new session to cache
            const newSession = await httpClient.exportSession();
            // FIX: Update timestamps before saving
            const now = Date.now();
            newSession.expiresAt = now + (15 * 60 * 1000);  // 15 min from now
            newSession.loginTimestamp = now;
            await saveSessionToCache(account.id, prepareSharedSessionForCache(newSession), httpClient.getSessionTimeout());
            console.log(`[HTTP] ✅ Fresh login successful for ${operationName} (attempt ${attempt})`);

            return true;

        } catch (error: unknown) {
            lastError = getErrMsg(error);
            console.log(`[HTTP] ❌ Attempt ${attempt}/${MAX_LOGIN_RETRIES} threw: ${lastError}`);

            if (attempt < MAX_LOGIN_RETRIES) {
                console.log(`[HTTP] ⏳ Retrying in ${LOGIN_RETRY_DELAY_MS}ms...`);
                await new Promise(resolve => setTimeout(resolve, LOGIN_RETRY_DELAY_MS));
            }
        }
    }

    // All attempts exhausted
    console.error(`[HTTP] 🚫 All ${MAX_LOGIN_RETRIES} login attempts failed for ${account.username}. Last error: ${lastError}`);
    throw new Error(`Login failed after ${MAX_LOGIN_RETRIES} attempts: ${lastError}`);
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
    } catch (error: unknown) {
        // Handle thrown errors
        if (!isSessionExpiredError(getErrMsg(error))) {
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
        throw new Error(`Session expired (${ageMinutes} minutes). Please retry the operation.`);
    }

    console.log(`[HTTP] Session age: ${ageMinutes} minutes (within ${maxMinutes} min limit for ${flowType})`);
}

/**
 * Update the progress message shown to the user during processing
 * Fire-and-forget: non-blocking to avoid adding latency to the operation flow
 */
function updateProgress(operationId: string, message: string): void {
    prisma.operation.update({
        where: { id: operationId },
        data: { responseMessage: message }
    }).catch(() => {
        // Non-critical - don't let progress updates break the flow
    });
}

/**
 * Main processor for HTTP-based operations
 */
export async function processOperationHttp(
    job: Job<OperationJobData>,
    accountPool: AccountPoolManager
): Promise<void> {
    const { operationId, type, cardNumber, promoCode, userId, amount, accountId, smartcardType } = job.data;
    let selectedAccountId: string | null = null;

    console.log(`📥 [HTTP] Processing ${operationId}: ${type}`);

    try {
        switch (type) {
            case 'CHECK_ACCOUNT_BALANCE':
                if (accountId) {
                    try {
                        await handleCheckAccountBalance(accountId);
                    } catch (balanceError: unknown) {
                        console.error(`❌ [HTTP] CHECK_ACCOUNT_BALANCE failed for ${accountId}:`, getErrMsg(balanceError));
                        // Don't throw - this job type has no operation to refund
                    }
                }
                return; // Exit early - no operation to update on success or failure
            case 'START_RENEWAL':
                await handleStartRenewalHttp(operationId, cardNumber, accountPool, smartcardType);
                break;
            case 'COMPLETE_PURCHASE':
                await handleCompletePurchaseHttp(operationId, promoCode, accountPool);
                break;
            case 'APPLY_PROMO':
                await handleApplyPromoHttp(operationId, cardNumber, promoCode, accountPool);
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
    } catch (error: unknown) {
        if (error instanceof OperationCancelledError) {
            console.log(`🚫 [HTTP] Operation ${operationId} cancelled`);
            return;
        }

        console.error(`❌ [HTTP] Operation ${operationId} failed:`, getErrMsg(error));

        // ALWAYS read from DB - job data amount may be stale (deferred payment)
        const op = await prisma.operation.findUnique({
            where: { id: operationId },
            select: { userId: true, amount: true, beinAccountId: true, status: true, responseData: true }
        });
        if (!op) {
            console.warn(`[HTTP] Operation ${operationId} missing during generic error handling; skipping refund/failure update`);
            return;
        }
        if (isTerminalStatus(op?.status)) {
            console.log(`[HTTP] Skipping refund/failure update for terminal operation ${operationId} (${op?.status})`);
            return;
        }
        const opUserId = op?.userId || userId;
        const opAmount = op?.amount || 0;
        selectedAccountId = op?.beinAccountId || null;
        const genericDecision = decideFinalPayRefundSafety({
            success: false,
            message: getErrMsg(error)
        }, hasFinalPaymentStarted(op?.status, op?.responseData));
        if (hasFinalPaymentStarted(op?.status, op?.responseData) && genericDecision.reviewRequired) {
            await prisma.operation.updateMany({
                where: {
                    id: operationId,
                    status: { notIn: TERMINAL_STATUS_LIST }
                },
                data: {
                    status: 'REVIEW_REQUIRED',
                    responseMessage: getErrMsg(error),
                    finalConfirmExpiry: null
                }
            });
            const auditSnapshot = await buildOperationAuditSnapshot({
                operationId,
                userId: op.userId || opUserId || null,
                beinAccountId: op.beinAccountId || null,
                beinUsername: null,
                beinBalanceBefore: null,
                beinBalanceAfter: null,
                outcomeCategory: genericDecision.outcomeCategory,
                reviewReason: getErrMsg(error),
                reviewSource: 'worker-generic-catch',
                refundBlocked: true
            });
            await persistOperationAuditSnapshot(operationId, op.responseData, auditSnapshot);
            console.warn(`[HTTP] Operation ${operationId} moved to REVIEW_REQUIRED from generic catch (${genericDecision.outcomeCategory}): ${getErrMsg(error)}`);
            return;
        }

        // Mark failed and refund (only if money was actually deducted)
        if (opUserId && opAmount && opAmount > 0) {
            await refundUser(operationId, opUserId, opAmount, getErrMsg(error));
        }
        await markOperationFailed(operationId, { type: 'UNKNOWN', message: getErrMsg(error), recoverable: false }, 1);
    } finally {
        if (selectedAccountId) {
            await accountPool.releaseLock(selectedAccountId).catch((releaseError: unknown) => {
                console.warn(`[HTTP] Failed to release account lock for ${selectedAccountId}: ${getErrMsg(releaseError)}`);
            });
        }
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
    accountPool: AccountPoolManager,
    smartcardType?: string
): Promise<void> {
    console.log(`🚀 [HTTP] Starting renewal for ${operationId}`);

    await checkIfCancelled(operationId);

    const operation = await prisma.operation.findUnique({
        where: { id: operationId },
        select: { userId: true }
    });

    // Mark as PROCESSING
    if (!await updateOperationIfActive(operationId, { status: 'PROCESSING', responseMessage: 'Searching for available account...' }, 'START_RENEWAL processing update')) return;

    // Get next available account with queue-based retry
    // If no account is immediately available, wait in queue up to 2 minutes
    const queueManager = getQueueManager(accountPool);
    const queueResult = await queueManager.acquireAccountWithQueue(operationId, 0, 120_000);

    if (!queueResult.account) {
        if (queueResult.timedOut) {
            throw new Error('NO_AVAILABLE_ACCOUNTS: No available accounts - queue wait timeout');
        }
        throw new Error(queueResult.error || 'NO_AVAILABLE_ACCOUNTS: No available accounts');
    }

    const selectedAccount = queueResult.account;
    if (queueResult.waitTimeMs > 0) {
        console.log(`[HTTP] Operation ${operationId} waited ${Math.round(queueResult.waitTimeMs / 1000)}s in queue`);
    }

    if (!await updateOperationIfActive(operationId, { beinAccountId: selectedAccount.id }, 'START_RENEWAL account update')) {
        await accountPool.markAccountUsed(selectedAccount.id);
        return;
    }

    console.log(`🔑 [HTTP] Using account: ${selectedAccount.label || selectedAccount.username}`);

    // Get HTTP client for this account (also reloads config if cache expired)
    const client = await createOperationClient(selectedAccount);

    // Step 1: Login (with Redis session caching and login locking)
    await updateProgress(operationId, 'Logging in...');
    let needsFreshLogin = true;

    // Check if we already have a valid session from Redis cache
    if (client.isSessionActive()) {
        // IMPORTANT: Validate session with beIN server before trusting Redis cache
        // The keepalive may have missed this account, or beIN may have expired it early
        console.log(`[HTTP] 🔍 Validating cached session for ${selectedAccount.username} on beIN server...`);
        const sessionValid = await client.validateSession();

        if (sessionValid) {
            console.log(`[HTTP] ✅ Session validated on beIN — using cached session for ${selectedAccount.username}`);
            needsFreshLogin = false;
        } else {
            console.log(`[HTTP] ⚠️ Session expired on beIN despite Redis cache — need fresh login`);
            // Delete stale session from Redis so other workers don't use it
            await deleteSessionFromCache(selectedAccount.id);
            needsFreshLogin = true;
        }
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
                    console.log('✅ [HTTP] CAPTCHA auto-solved: [REDACTED]');
                } catch (autoSolveError: unknown) {
                    console.log(`⚠️ [HTTP] Auto-solve failed: ${getErrMsg(autoSolveError)}, falling back to manual`);
                }
            } else {
                console.log(`⚠️ [HTTP] No 2Captcha API key configured, using manual entry`);
            }

            // Fallback to manual if auto-solve failed or not configured
            if (!solution) {
                // Set heartbeat expiry for auto-cancel if user leaves page
                const now = new Date();
                const heartbeatExpiry = new Date(now.getTime() + HEARTBEAT_TTL_SECONDS * 1000);

                if (!await updateOperationIfActive(operationId, {
                    status: 'AWAITING_CAPTCHA',
                    captchaImage: loginResult.captchaImage,
                    captchaExpiry: new Date(Date.now() + CAPTCHA_TIMEOUT_MS),
                    // Heartbeat system - allows cleanup cron to auto-cancel stuck operations
                    lastHeartbeat: now,
                    heartbeatExpiry: heartbeatExpiry
                }, 'START_RENEWAL captcha update')) {
                    await releaseLoginLock(selectedAccount.id, WORKER_ID);
                    await accountPool.markAccountUsed(selectedAccount.id);
                    return;
                }

                solution = await waitForCaptchaSolution(operationId);
                if (!solution) {
                    // Release lock before throwing
                    await releaseLoginLock(selectedAccount.id, WORKER_ID);
                    throw new Error('CAPTCHA_TIMEOUT: Verification code was not entered');
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
                await trackCredentialLoginFailure(
                    selectedAccount.id,
                    loginWithCaptcha.error || 'Login failed after CAPTCHA'
                );
                // Release lock before throwing
                await releaseLoginLock(selectedAccount.id, WORKER_ID);
                throw new Error(loginWithCaptcha.error || 'Login failed after CAPTCHA');
            }
        } else if (!loginResult.success) {
            await trackCredentialLoginFailure(
                selectedAccount.id,
                loginResult.error || 'Login failed'
            );
            // Release lock before throwing
            await releaseLoginLock(selectedAccount.id, WORKER_ID);
            throw new Error(loginResult.error || 'Login failed');
        }

        await trackFreshLoginSuccess(selectedAccount.id);

        // Login successful - save session to Redis cache
        try {
            const sessionData = await client.exportSession();
            const sessionTimeout = client.getSessionTimeout();
            await saveSessionToCache(selectedAccount.id, prepareSharedSessionForCache(sessionData), sessionTimeout);
            console.log(`[HTTP] 💾 Session saved to Redis cache (TTL: ${sessionTimeout} min)`);
        } catch (saveError) {
            console.error(`[HTTP] ⚠️ Failed to save session to cache:`, saveError);
        }

        // Release login lock
        await releaseLoginLock(selectedAccount.id, WORKER_ID);
    }

    // ============================================
    // PARALLEL: Run checkCard + loadPackages simultaneously
    // checkCard hits frmCheck.aspx, loadPackages hits frmSellPackages.aspx
    // They use different pages so they can safely run in parallel (~4s saved)
    // ============================================

    updateProgress(operationId, 'Loading card info...');
    let stbNumber: string | undefined;

    // Use cache only to skip card/STB lookup before final Pay.
    // Package prices/options are still loaded fresh from beIN for this operation.
    const cachedPackageData = await getCachedPackages(cardNumber);
    const cachedStb = cachedPackageData?.stbNumber || await getCachedSTB(cardNumber);

    let packagesResult: { success: boolean; packages: AvailablePackage[]; stbNumber?: string; dealerBalance?: number; error?: string };

    if (cachedStb) {
        // STB is cached — only run loadPackages (skip checkCard entirely)
        console.log(`[HTTP] ⚡ STB CACHE HIT (${cachedStb}) — running loadPackages only`);
        client.setSTBNumber(cachedStb);
        stbNumber = cachedStb;

        console.log(`📦 [HTTP] Loading packages... (smartcard: ${smartcardType || 'CISCO'})`);
        packagesResult = await withSessionRetry(
            client,
            selectedAccount,
            () => client.loadPackages(cardNumber, smartcardType || 'CISCO'),
            'loadPackages'
        );
    } else {
        // No STB cache — run BOTH in parallel
        console.log(`🔍📦 [HTTP] Running checkCard + loadPackages in PARALLEL...`);
        const startTime = Date.now();

        const [checkResult, pkgResult] = await Promise.all([
            withSessionRetry(
                client,
                selectedAccount,
                () => client.checkCard(cardNumber),
                'checkCard'
            ),
            withSessionRetry(
                client,
                selectedAccount,
                () => client.loadPackages(cardNumber, smartcardType || 'CISCO'),
                'loadPackages'
            )
        ]);

        console.log(`⚡ [HTTP] Parallel operations completed in ${Date.now() - startTime}ms`);

        if (!checkResult.success) {
            console.log(`⚠️ [HTTP] checkCard failed: ${checkResult.error} (non-fatal, STB may not be available)`);
        } else {
            stbNumber = checkResult.stbNumber;
            // Cache STB (fire-and-forget)
            if (stbNumber) {
                cacheSTB(cardNumber, stbNumber).catch(() => { });
            }
        }

        packagesResult = pkgResult;
    }

    if (!packagesResult.success) {
        throw new Error(packagesResult.error || 'Failed to load packages');
    }

    // Use STB from checkCard (or cache), fallback to loadPackages
    const finalStbNumber = stbNumber || packagesResult.stbNumber || client.getSTBNumber();

    // Cache STB for future operations (fire-and-forget)
    if (finalStbNumber && !cachedStb) {
        cacheSTB(cardNumber, finalStbNumber).catch(() => { });
    }

    // Update account's dealer balance and check for low balance auto-disable
    if (packagesResult.dealerBalance !== undefined) {
        await prisma.beinAccount.update({
            where: { id: selectedAccount.id },
            data: {
                dealerBalance: packagesResult.dealerBalance,
                balanceUpdatedAt: new Date()
            }
        });
        console.log(`[HTTP] 💰 Dealer balance: ${packagesResult.dealerBalance} USD`);
        await checkAndNotifyLowBalance(selectedAccount.id, selectedAccount.label || selectedAccount.username, packagesResult.dealerBalance);
    }

    // Convert to format expected by frontend
    const packages = packagesResult.packages.map((pkg, i) => ({
        index: pkg.index,
        name: pkg.name,
        price: pkg.price,
        checkboxSelector: pkg.checkboxValue, // Keep for compatibility (backend)
        checkboxValue: pkg.checkboxValue,    // Add for Flutter compatibility
    }));

    // Cache packages for future requests (fire-and-forget)
    cachePackages(
        cardNumber,
        packagesResult.packages,
        finalStbNumber || null,
        packagesResult.dealerBalance || null
    ).catch(() => { });

    // CRITICAL: Export session data for cross-worker access.
    // Different PM2 workers have separate memory, so the operation-scoped
    // ViewState and cookies are stored server-side in Redis only.
    const sessionData = await client.exportSession();
    await saveOperationSessionToCache(operationId, sessionData, 180);

    // Update operation with packages and safe user-facing metadata.
    // CRITICAL: Set heartbeatExpiry so cleanup cron knows when to auto-cancel
    const now = new Date();
    const heartbeatExpiry = new Date(now.getTime() + HEARTBEAT_TTL_SECONDS * 1000);

    if (!await updateOperationIfActive(operationId, {
        status: 'AWAITING_PACKAGE',
        beinAccountId: selectedAccount.id,  // Merged here instead of separate update
        stbNumber: finalStbNumber,
        availablePackages: packages,
        captchaImage: null,
        captchaSolution: null,
        captchaExpiry: null,
        // Hard deadline: 2 minutes to select a package, then auto-cancel
        finalConfirmExpiry: new Date(now.getTime() + 120_000),  // 2 minutes
        // Heartbeat system - allows cleanup cron to auto-cancel stuck operations
        lastHeartbeat: now,
        heartbeatExpiry: heartbeatExpiry,
        // Operation session is stored server-side in Redis.
        responseData: JSON.stringify({
            dealerBalance: packagesResult.dealerBalance,  // For balance validation
            savedAt: new Date().toISOString(),
            smartcardType: smartcardType || 'CISCO'  // Persist for COMPLETE_PURCHASE retry
        })
    }, 'START_RENEWAL package update')) {
        await accountPool.markAccountUsed(selectedAccount.id);
        return;
    }

    await accountPool.markAccountUsed(selectedAccount.id);

    console.log(`✅ [HTTP] Packages loaded for ${operationId}: ${packages.length} packages, Dealer Balance: ${packagesResult.dealerBalance || 'N/A'} USD`);
}

/**
 * APPLY_PROMO - Apply a promo code and refresh package prices
 * 
 * Flow:
 * 1. Get the operation and its assigned beIN account
 * 2. Restore session from cache or re-login
 * 3. Call applyPromoCode() on HttpClientService
 * 4. Update operation with new packages in responseData (promoApplied: true)
 * 5. Keep status as AWAITING_PACKAGE so user can select a package
 */
async function handleApplyPromoHttp(
    operationId: string,
    cardNumber: string,
    promoCode: string | undefined,
    accountPool: AccountPoolManager
): Promise<void> {
    console.log(`🎫 [HTTP] Applying promo code for ${operationId}`);

    if (!promoCode) {
        await prisma.operation.update({
            where: { id: operationId },
            data: {
                responseData: JSON.stringify({ promoApplied: false, error: 'No promo code provided' })
            }
        });
        return;
    }

    await checkIfCancelled(operationId);

    // Get operation with account
    const operation = await prisma.operation.findUnique({
        where: { id: operationId },
        select: {
            id: true,
            beinAccountId: true,
            cardNumber: true,
            status: true,
            responseData: true,
        }
    });

    if (!operation || !operation.beinAccountId) {
        await prisma.operation.update({
            where: { id: operationId },
            data: {
                responseData: JSON.stringify({ promoApplied: false, error: 'Operation or account not found' })
            }
        });
        return;
    }

    // Get account (decrypt password from DB)
    const account = await prisma.beinAccount.findUnique({
        where: { id: operation.beinAccountId },
        include: { proxy: true }
    }).then(a => a ? decryptAccountPassword(a) : null);

    if (!account) {
        await prisma.operation.update({
            where: { id: operationId },
            data: {
                responseData: JSON.stringify({ promoApplied: false, error: 'beIN account not found' })
            }
        });
        return;
    }

    const existingResponseData = parseResponseDataObject(operation.responseData);
    delete existingResponseData.sessionData;
    const redis = accountPool.getRedis();
    const LOCK_WAIT_TIMEOUT = 15_000;
    const LOCK_TTL = 90;
    const lockStartTime = Date.now();
    let lockAcquired = false;

    while (Date.now() - lockStartTime < LOCK_WAIT_TIMEOUT) {
        lockAcquired = await lockAccount(redis, operation.beinAccountId, WORKER_ID, LOCK_TTL);
        if (lockAcquired) break;
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!lockAcquired) {
        await prisma.operation.update({
            where: { id: operationId },
            data: {
                responseData: JSON.stringify({
                    ...existingResponseData,
                    promoApplied: false,
                    refreshing: false,
                    error: 'beIN account is busy. Please retry promo in a few seconds.',
                }),
            }
        });
        return;
    }

    try {
        const client = await createOperationClient(account);
        try {
            const restored = await restoreOperationSession(operationId, operation.responseData, client);
            if (restored) console.log('[HTTP] Promo flow restored operation-scoped session snapshot');
        } catch (sessionImportError: unknown) {
            console.log(`[HTTP] Failed to import operation session snapshot: ${getErrMsg(sessionImportError)}`);
        }

        // Ensure session is active
        if (!client.isSessionActive()) {
            console.log(`[HTTP] ⚠️ Session expired for promo apply, restoring...`);
            const cachedSession = await getSessionFromCache(account.id);
            if (cachedSession) {
                await client.importSession(cachedSession);
                client.markSessionValidFromCache(cachedSession.expiresAt);
                console.log(`[HTTP] ✅ Session restored from cache for promo`);
            } else {
                // Fresh login needed
                const loginResult = await client.login(
                    account.username,
                    account.password,
                    account.totpSecret || undefined
                );
                if (loginResult.requiresCaptcha && loginResult.captchaImage) {
                    await prisma.operation.update({
                        where: { id: operationId },
                        data: {
                            responseData: JSON.stringify({
                                ...existingResponseData,
                                promoApplied: false,
                                refreshing: false,
                                error: 'Login requires CAPTCHA for promo apply'
                            })
                        }
                    });
                    return;
                }

                if (!loginResult.success) {
                    await trackCredentialLoginFailure(account.id, loginResult.error || 'Login failed');
                    await prisma.operation.update({
                        where: { id: operationId },
                        data: {
                            responseData: JSON.stringify({
                                ...existingResponseData,
                                promoApplied: false,
                                refreshing: false,
                                error: 'Login failed for promo apply'
                            })
                        }
                    });
                    return;
                }

                await trackFreshLoginSuccess(account.id);
                // Save session to cache
                try {
                    const sessionData = await client.exportSession();
                    const sessionTimeout = client.getSessionTimeout();
                    await saveSessionToCache(account.id, prepareSharedSessionForCache(sessionData), sessionTimeout);
                } catch (saveError) {
                    console.error('[HTTP] Failed to save session to cache:', saveError);
                }
            }
        }

        // Apply promo code
        console.log(`[HTTP] 🎫 Applying promo code: ${promoCode}`);
        const useCardNumber = cardNumber || operation.cardNumber;
        const result = await client.applyPromoCode(promoCode, useCardNumber);
        const latestSessionData = await client.exportSession().catch(() => null);
        const mergedResponseBase: Record<string, unknown> = {
            ...existingResponseData,
            refreshing: false,
            promoCode: promoCode || null,
        };
        if (latestSessionData) {
            await saveOperationSessionToCache(operationId, latestSessionData, 180);
            mergedResponseBase.savedAt = new Date().toISOString();
        }

        if (result.success && result.packages.length > 0) {
            const normalizedPackages = result.packages.map((pkg) => ({
                index: pkg.index,
                name: pkg.name,
                price: pkg.price,
                checkboxSelector: pkg.checkboxValue,
                checkboxValue: pkg.checkboxValue,
            }));

            // Update operation with new discounted packages
            await prisma.operation.update({
                where: { id: operationId },
                data: {
                    availablePackages: JSON.parse(JSON.stringify(normalizedPackages)),
                    responseData: JSON.stringify({
                        ...mergedResponseBase,
                        promoApplied: true,
                        error: null,
                        packages: normalizedPackages
                    })
                }
            });
            console.log(`✅ [HTTP] Promo code applied, ${result.packages.length} packages updated`);
        } else {
            const normalizedPackages = result.packages.map((pkg) => ({
                index: pkg.index,
                name: pkg.name,
                price: pkg.price,
                checkboxSelector: pkg.checkboxValue,
                checkboxValue: pkg.checkboxValue,
            }));

            // Promo failed — update responseData with error
            await prisma.operation.update({
                where: { id: operationId },
                data: {
                    ...(normalizedPackages.length > 0
                        ? { availablePackages: JSON.parse(JSON.stringify(normalizedPackages)) }
                        : {}),
                    responseData: JSON.stringify({
                        ...mergedResponseBase,
                        promoApplied: false,
                        error: result.error || 'Failed to apply promo code',
                        packages: normalizedPackages
                    })
                }
            });
            console.log(`⚠️ [HTTP] Promo code failed: ${result.error}`);
        }
    } finally {
        await unlockAccount(redis, operation.beinAccountId, WORKER_ID).catch((releaseError: unknown) => {
            const releaseMessage = releaseError instanceof Error ? releaseError.message : String(releaseError);
            console.warn(`[HTTP] Failed to release promo lock for ${operationId}: ${releaseMessage}`);
        });
    }
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
        checkboxSelector?: string;
        checkboxValue?: string;
    } | null;

    if (!selectedPackage) {
        throw new Error('No package selected');
    }

    if (!await updateOperationIfActive(operationId, { status: 'COMPLETING', responseMessage: 'Completing purchase...' }, 'COMPLETE_PURCHASE completing update')) return;

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
            console.log(`[HTTP] Purchase prepared for final confirmation on attempt ${attemptNumber}`);
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
                ? 'beIN account balance insufficient. No other accounts available with sufficient balance.'
                : `Operation failed after trying ${triedAccountIds.length} accounts. ${lastError}`;

            throw new Error(finalError);
        }

        // Update operation with new account
        if (!await updateOperationIfActive(operationId, { beinAccountId: nextAccount.id }, 'COMPLETE_PURCHASE account update')) {
            await accountPool.markAccountUsed(nextAccount.id);
            return;
        }

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
        responseData: unknown;
    },
    accountId: string,
    selectedPackage: {
        index: number;
        name: string;
        price: number;
        checkboxSelector?: string;
        checkboxValue?: string;
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
        // Get account (decrypt password from DB)
        const account = await prisma.beinAccount.findUnique({
            where: { id: accountId },
            include: { proxy: true }
        }).then(a => a ? decryptAccountPassword(a) : null);

        if (!account) {
            return {
                success: false,
                shouldRetryDifferentAccount: true,
                isBalanceError: false,
                error: 'Account not found'
            };
        }

        const client = await createOperationClient(account);

        // Try to restore session from database (for same-account retry from START_RENEWAL)
        let dealerBalance: number | undefined;
        const isOriginalAccount = triedAccountIds.length === 0;

        if (isOriginalAccount && operation.responseData) {
            try {
                const savedData = parseResponseDataObject(operation.responseData);

                // Validate session age
                if (typeof savedData.savedAt === 'string') {
                    validateSessionAge(savedData.savedAt, 'completePurchase');
                }

                const restored = await restoreOperationSession(operationId, operation.responseData, client);
                if (restored) console.log(`[HTTP] Restored operation-scoped session`);

                dealerBalance = typeof savedData.dealerBalance === 'number' ? savedData.dealerBalance : undefined;
            } catch (parseError: unknown) {
                console.log(`[HTTP] ⚠️ Could not restore saved session: ${getErrMsg(parseError)}`);
            }
        }

        // Extract smartcardType from responseData (persisted during START_RENEWAL)
        let savedSmartcardType = 'CISCO';
        try {
            if (operation.responseData) {
                const savedData = parseResponseDataObject(operation.responseData);
                savedSmartcardType = typeof savedData.smartcardType === 'string' ? savedData.smartcardType : 'CISCO';
            }
        } catch { /* ignore parse errors */ }

        // For non-original account or if session restore failed, need fresh login + loadPackages
        if (!isOriginalAccount || !client.isSessionActive()) {
            await updateProgress(operationId, 'Logging in...');
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
                        await trackCredentialLoginFailure(
                            accountId,
                            loginWithCaptcha.error || 'Login failed after CAPTCHA'
                        );
                        await accountPool.markAccountFailed(accountId, `CAPTCHA login failed: ${loginWithCaptcha.error}`);
                        return {
                            success: false,
                            shouldRetryDifferentAccount: true,
                            isBalanceError: false,
                            error: `Login with CAPTCHA failed: ${loginWithCaptcha.error}`
                        };
                    }
                } catch (captchaError: unknown) {
                    await accountPool.markAccountFailed(accountId, `CAPTCHA solve failed: ${getErrMsg(captchaError)}`);
                    return {
                        success: false,
                        shouldRetryDifferentAccount: true,
                        isBalanceError: false,
                        error: `CAPTCHA auto-solve failed: ${getErrMsg(captchaError)}`
                    };
                }
            } else if (!loginResult.success) {
                await trackCredentialLoginFailure(accountId, loginResult.error || 'Login failed');
                await accountPool.markAccountFailed(accountId, `Login failed: ${loginResult.error}`);
                return {
                    success: false,
                    shouldRetryDifferentAccount: true,
                    isBalanceError: false,
                    error: `Login failed: ${loginResult.error}`
                };
            }

            await trackFreshLoginSuccess(accountId);

            // Load packages with session retry (use saved smartcard type)
            console.log(`[HTTP] 📦 Loading packages for new account (smartcard: ${savedSmartcardType})...`);
            const packagesResult = await withSessionRetry(
                client,
                account,
                () => client.loadPackages(operation.cardNumber, savedSmartcardType),
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
                await checkAndNotifyLowBalance(accountId, account.label || account.username, dealerBalance);
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


            return {
                success: false,
                shouldRetryDifferentAccount: true,
                isBalanceError: true,
                error: `Insufficient balance: ${dealerBalance} < ${selectedPackage.price}`
            };
        }

        // Convert to AvailablePackage format
        const selectedCheckboxValue = selectedPackage.checkboxSelector || selectedPackage.checkboxValue || '';
        const pkg: AvailablePackage = {
            index: selectedPackage.index,
            name: selectedPackage.name,
            price: selectedPackage.price,
            checkboxValue: selectedCheckboxValue
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
            await saveOperationSessionToCache(operationId, updatedSessionData, 90);

            // Set heartbeat expiry
            const now = new Date();
            const heartbeatExpiry = new Date(now.getTime() + HEARTBEAT_TTL_SECONDS * 1000);

            if (!await updateOperationIfActive(operationId, {
                status: 'AWAITING_FINAL_CONFIRM',
                finalConfirmExpiry: new Date(Date.now() + 30000),  // 30 seconds
                responseMessage: result.message,
                lastHeartbeat: now,
                heartbeatExpiry: heartbeatExpiry,
                responseData: JSON.stringify({
                    dealerBalance: dealerBalance,
                    dealerBalanceBefore: dealerBalance,
                    operationPhase: 'FINAL_CONFIRMATION_REQUESTED',
                    jobType: 'COMPLETE_PURCHASE',
                    finalPaySubmitted: false,
                    savedAt: new Date().toISOString()
                })
            }, 'COMPLETE_PURCHASE final confirm update')) {
                await accountPool.markAccountUsed(accountId);
                return { success: true, shouldRetryDifferentAccount: false, isBalanceError: false };
            }

            if (operation.userId) {
                await createNotification({
                    userId: operation.userId,
                    title: '⚠️ Payment confirmation required',
                    message: `${selectedPackage.name} - ${selectedPackage.price} USD`,
                    type: 'warning',
                    link: '/dashboard/operations'
                });
            }

            return { success: true, shouldRetryDifferentAccount: false, isBalanceError: false };
        }

        // Direct success (shouldn't happen with skipFinalClick=true)
        if (result.success) {
            if (!await updateOperationIfActive(operationId, {
                status: 'COMPLETED',
                responseMessage: result.message,
                completedAt: new Date()
            }, 'COMPLETE_PURCHASE direct completion update')) {
                await accountPool.markAccountUsed(accountId);
                return { success: true, shouldRetryDifferentAccount: false, isBalanceError: false };
            }
            await accountPool.markAccountUsed(accountId);
            return { success: true, shouldRetryDifferentAccount: false, isBalanceError: false };
        }

        // Purchase failed
        throw new Error(result.message);

    } catch (error: unknown) {
        const errorMessage = getErrMsg(error) || 'Unknown error';
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

    // Guard: skip if already terminal (race condition with duplicate jobs)
    // NOTE: COMPLETING is valid - the confirm-purchase API sets it before adding this job.
    if (isTerminalStatus(operation.status)) {
        console.log(`⏭️ [HTTP] Operation ${operationId} already terminal (${operation.status}), skipping CONFIRM_PURCHASE`);
        return;
    }

    // Valid states: AWAITING_FINAL_CONFIRM (legacy) or COMPLETING (set by confirm-purchase API)
    if (operation.status !== 'AWAITING_FINAL_CONFIRM' && operation.status !== 'COMPLETING') {
        throw new Error(`Invalid status: ${operation.status}`);
    }

    if (operation.finalConfirmExpiry && new Date() > operation.finalConfirmExpiry) {
        if (operation.userId && operation.amount && operation.amount > 0) {
            await refundUser(operationId, operation.userId, operation.amount, 'Confirmation timeout');
        }
        await markOperationFailed(operationId, { type: 'TIMEOUT', message: 'Confirmation timeout', recoverable: false }, 1);
        throw new Error('Confirmation timeout');
    }

    if (!await updateOperationIfActive(operationId, {
        status: 'COMPLETING',
        responseMessage: 'Confirming purchase...'
    }, 'CONFIRM_PURCHASE completing update')) return;

    const account = await prisma.beinAccount.findUnique({
        where: { id: operation.beinAccountId },
        include: { proxy: true }  // CRITICAL: Include proxy for HTTP client
    }).then(a => a ? decryptAccountPassword(a) : null);
    if (!account) throw new Error('Account not found');

    try {
        const client = await createOperationClient(account);
        let preFinalBeinBalance: number | null = null;

        // CRITICAL: Set STB number on client for confirmPurchase
        if (operation.stbNumber) {
            client.setSTBNumber(operation.stbNumber);
            console.log('[HTTP] STB number restored for CONFIRM_PURCHASE');
        } else {
            console.warn('[HTTP] ⚠️ No STB number found in operation!');
        }

        // CRITICAL: Restore session from server-side cache (cross-worker support)
        // Without this, the ViewState and cookies are missing and purchase fails silently!
        if (operation.responseData) {
            try {
                const savedData = parseResponseDataObject(operation.responseData);
                preFinalBeinBalance =
                    toNullableNumber(savedData.dealerBalanceBefore) ??
                    toNullableNumber(savedData.dealerBalance);

                // AUDIT FIX 4.2: Use helper function for session age validation
                if (typeof savedData.savedAt === 'string') {
                    validateSessionAge(savedData.savedAt, 'confirmPurchase');
                }

                const restored = await restoreOperationSession(operationId, operation.responseData, client);
                if (!restored) {
                    throw new Error('No session data available - cannot confirm purchase');
                }
                console.log(`[HTTP] Session restored for CONFIRM_PURCHASE`);

            } catch (sessionError: unknown) {
                if (getErrMsg(sessionError).includes('Session expired')) {
                    throw sessionError; // Re-throw session expiry error
                }
                console.error('[HTTP] Failed to restore saved session for confirm:', sessionError);
                throw new Error('Session restoration failed - cannot confirm purchase');
            }
        } else {
            console.error('[HTTP] ❌ No saved session found - cannot confirm purchase');
            throw new Error('No session data available - cannot confirm purchase');
        }

        await updateProgress(operationId, 'Sending final confirmation...');
        const rawResult = await client.confirmPurchase(operation.amount ?? undefined, async () => {
            await updateOperationIfActive(operationId, {
                responseData: mergeOperationPhaseData(operation.responseData, {
                    operationPhase: 'FINAL_PAY_SUBMITTED',
                    jobType: 'CONFIRM_PURCHASE',
                    finalPaySubmitted: true,
                    finalPaySubmittedAt: new Date().toISOString(),
                    dealerBalanceBefore: preFinalBeinBalance
                })
            }, 'CONFIRM_PURCHASE final Pay evidence update');
        });
        const result = {
            ...rawResult,
            beinBalanceBefore: toNullableNumber(rawResult.beinBalanceBefore) ?? preFinalBeinBalance ?? undefined
        };
        const outcomeDecision = decideFinalPayRefundSafety(result, result.finalPaySubmitted === true);

        const selectedPackage = operation.selectedPackage as { name: string } | null;

        if (result.success) {
            // OPTIMIZATION: Invalidate package cache since packages changed after purchase
            if (operation.cardNumber) {
                await invalidatePackageCache(operation.cardNumber);
            }

            const completed = await prisma.operation.updateMany({
                where: {
                    id: operationId,
                    status: { notIn: TERMINAL_STATUS_LIST }
                },
                data: {
                    status: 'COMPLETED',
                    responseMessage: result.message,
                    completedAt: new Date(),
                    finalConfirmExpiry: null
                }
            });
            if (completed.count === 0) {
                console.warn(`[HTTP] CONFIRM_PURCHASE completion skipped for ${operationId} due to terminal transition race`);
                return;
            }

            const ledgerResult = operation.userId
                ? await recordConfirmedBeinSpend({
                    operationId,
                    userId: operation.userId,
                    beinAccountId: operation.beinAccountId,
                    dealerBalanceBefore: toNullableNumber(result.beinBalanceBefore),
                    dealerBalanceAfter: toNullableNumber(result.beinBalanceAfter),
                    evidenceSource: 'BALANCE_DELTA',
                })
                : null;
            if (ledgerResult?.status === 'conflict_review_required') {
                console.warn(`[HTTP] beIN spend ledger conflict for ${operationId}: ${ledgerResult.reason}`);
            }

            const auditSnapshot = await buildOperationAuditSnapshot({
                operationId,
                userId: operation.userId || null,
                beinAccountId: operation.beinAccountId,
                beinUsername: account.username,
                beinBalanceBefore: toNullableNumber(result.beinBalanceBefore),
                beinBalanceAfter: toNullableNumber(result.beinBalanceAfter),
                chargedBeinLedgerId: ledgerResult && 'ledgerId' in ledgerResult ? ledgerResult.ledgerId : undefined
            });
            await persistOperationAuditSnapshot(operationId, operation.responseData, auditSnapshot);

            await accountPool.markAccountUsed(operation.beinAccountId);
            await deleteOperationSessionFromCache(operationId);

            // Track activity for user engagement metrics
            if (operation.userId) {
                await trackOperationComplete(
                    operation.userId,
                    operationId,
                    'RENEW',
                    operation.amount,
                    {
                        packageName: selectedPackage?.name,
                        beinAccountId: operation.beinAccountId,
                        beinUsernameSnapshot: auditSnapshot.beinUsername,
                        beinBalanceBefore: auditSnapshot.beinBalanceBefore,
                        beinBalanceAfter: auditSnapshot.beinBalanceAfter,
                        userBalanceBefore: auditSnapshot.userBalanceBefore,
                        userBalanceAfter: auditSnapshot.userBalanceAfter
                    }
                );

                await detectAndRecordOperationIntegrity({
                    operationId,
                    beinBalanceBefore: auditSnapshot.beinBalanceBefore ?? undefined,
                    beinBalanceAfter: auditSnapshot.beinBalanceAfter ?? undefined,
                    beinUsernameSnapshot: auditSnapshot.beinUsername ?? undefined,
                    userBalanceBefore: auditSnapshot.userBalanceBefore ?? undefined,
                    userBalanceAfter: auditSnapshot.userBalanceAfter ?? undefined
                });
            }

            if (operation.userId) {
                await createNotification({
                    userId: operation.userId,
                    title: 'Renewal successful',
                    message: `${selectedPackage?.name || 'Package'} - ${result.message}`,
                    type: 'success',
                    link: '/dashboard/history'
                });
            }

            console.log(`✅ [HTTP] Purchase confirmed for ${operationId}`);
        } else if (outcomeDecision.reviewRequired || !outcomeDecision.refundSafe) {
            const reviewRequired = await prisma.operation.updateMany({
                where: {
                    id: operationId,
                    status: { notIn: TERMINAL_STATUS_LIST }
                },
                data: {
                    status: 'REVIEW_REQUIRED',
                    responseMessage: result.message,
                    finalConfirmExpiry: null
                }
            });
            if (reviewRequired.count === 0) {
                console.warn(`[HTTP] CONFIRM_PURCHASE review update skipped for ${operationId} due to terminal transition race`);
                return;
            }

            const ledgerResult = operation.userId
                ? await recordConfirmedBeinSpend({
                    operationId,
                    userId: operation.userId,
                    beinAccountId: operation.beinAccountId,
                    dealerBalanceBefore: toNullableNumber(result.beinBalanceBefore),
                    dealerBalanceAfter: toNullableNumber(result.beinBalanceAfter),
                    evidenceSource: 'BALANCE_DELTA',
                })
                : null;
            if (ledgerResult?.status === 'conflict_review_required') {
                console.warn(`[HTTP] beIN spend ledger conflict for ${operationId}: ${ledgerResult.reason}`);
            }

            const auditSnapshot = await buildOperationAuditSnapshot({
                operationId,
                userId: operation.userId || null,
                beinAccountId: operation.beinAccountId,
                beinUsername: account.username,
                beinBalanceBefore: toNullableNumber(result.beinBalanceBefore),
                beinBalanceAfter: toNullableNumber(result.beinBalanceAfter),
                outcomeCategory: outcomeDecision.outcomeCategory,
                reviewReason: result.message,
                reviewSource: 'confirm-purchase',
                refundBlocked: true,
                chargedBeinLedgerId: ledgerResult && 'ledgerId' in ledgerResult ? ledgerResult.ledgerId : undefined
            });
            await persistOperationAuditSnapshot(operationId, operation.responseData, auditSnapshot);

            try {
                await accountPool.markAccountUsed(operation.beinAccountId);
            } catch (e: unknown) {
                console.error(`[HTTP] Failed to mark account used after REVIEW_REQUIRED for ${operationId}: ${getErrMsg(e)}`);
            }
            await deleteOperationSessionFromCache(operationId);
            console.warn(`[HTTP] Purchase for ${operationId} moved to REVIEW_REQUIRED (${outcomeDecision.outcomeCategory}): ${result.message}`);
            return;
        } else {
            if (operation.userId && operation.amount && operation.amount > 0) {
                await refundUser(operationId, operation.userId, operation.amount, result.message);
            }
            await markOperationFailed(operationId, { type: 'UNKNOWN', message: result.message, recoverable: false }, 1);
            await deleteOperationSessionFromCache(operationId);
            throw new Error(result.message);
        }
    } finally {
        // No lock cleanup needed - operations are independent
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
            status: true,
            responseData: true
        }
    });

    if (!operation) {
        throw new Error('Operation not found');
    }

    // Guard: terminal operations must not be overwritten by late cancel jobs.
    if (isTerminalStatus(operation.status)) {
        console.log(`[HTTP] Operation ${operationId} already terminal (${operation.status}), skipping CANCEL_CONFIRM`);
        return;
    }

    const cancellationConfirmInProgress =
        operation.status === OperationStatus.COMPLETING &&
        getOperationPhase(operation.responseData) === 'CANCELLATION_CONFIRM';

    if (hasFinalPaymentStarted(operation.status, operation.responseData)) {
        await prisma.operation.updateMany({
            where: {
                id: operationId,
                status: OperationStatus.COMPLETING
            },
            data: {
                status: OperationStatus.REVIEW_REQUIRED,
                responseMessage: 'Cancellation requested while final payment may be in progress. Manual review required.',
                finalConfirmExpiry: null
            }
        });
        const auditSnapshot = await buildOperationAuditSnapshot({
            operationId,
            userId: operation.userId || null,
            beinAccountId: operation.beinAccountId,
            beinUsername: null,
            beinBalanceBefore: null,
            beinBalanceAfter: null,
            reviewReason: 'Cancellation requested while final payment may be in progress. Manual review required.',
            reviewSource: 'cancel-confirm',
            refundBlocked: true
        });
        await persistOperationAuditSnapshot(operationId, operation.responseData, auditSnapshot);
        console.warn(`[HTTP] Cancellation for ${operationId} moved to REVIEW_REQUIRED because final payment may have started`);
        return;
    }

    if (operation.status !== OperationStatus.AWAITING_FINAL_CONFIRM && !cancellationConfirmInProgress) {
        console.warn(`[HTTP] Ignoring CANCEL_CONFIRM for ${operationId}; invalid status ${operation.status}`);
        return;
    }

    // Click Cancel if account available
    if (operation.beinAccountId) {
        try {
            const account = await prisma.beinAccount.findUnique({
                where: { id: operation.beinAccountId },
                include: { proxy: true }  // Include proxy for HTTP client
            }).then(a => a ? decryptAccountPassword(a) : null);
            if (account) {
                const client = await createOperationClient(account);
                await client.cancelPurchase();
            }
        } catch (e: unknown) {
            console.log(`⚠️ [HTTP] Failed to click cancel: ${getErrMsg(e)}`);
        }
    }

    const cancelled = await prisma.operation.updateMany({
        where: {
            id: operationId,
            status: cancellationConfirmInProgress
                ? OperationStatus.COMPLETING
                : OperationStatus.AWAITING_FINAL_CONFIRM
        },
        data: {
            status: OperationStatus.CANCELLED,
            responseMessage: 'Operation cancelled',
            completedAt: new Date(),
            finalConfirmExpiry: null
        }
    });

    if (cancelled.count === 0) {
        console.warn(`[HTTP] CANCEL_CONFIRM update skipped for ${operationId} due to state transition race`);
        return;
    }

    // Refund only after the guarded pre-final-payment cancellation succeeds.
    if (operation.userId && operation.amount && operation.amount > 0) {
        await refundUser(operationId, operation.userId, operation.amount, 'User cancellation');
    }

    if (operation.userId) {
        await createNotification({
            userId: operation.userId,
            title: 'Operation cancelled',
            message: operation.amount && operation.amount > 0 ? 'Purchase cancelled and amount refunded' : 'Purchase cancelled',
            type: 'info',
            link: '/dashboard/history'
        });
    }

    if (operation.beinAccountId) {
        await accountPool.markAccountUsed(operation.beinAccountId);
        // Force-unlock: markAccountUsed uses unlockAccount which checks worker ID ownership,
        // but cancels often run on a different worker than the one that locked the account.
        // Force-unlock guarantees the lock is released after cancellation.
        try {
            const redis = (accountPool as unknown as { redis?: import("ioredis").Redis }).redis;
            if (redis) {
                await forceUnlockAccount(redis, operation.beinAccountId);
                console.log(`🔓 [HTTP] Force-unlocked account ${operation.beinAccountId} after cancel`);
            }
        } catch (e: unknown) {
            console.log(`⚠️ [HTTP] Failed to force-unlock: ${getErrMsg(e)}`);
        }
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
    if (!await updateOperationIfActive(operationId, { status: 'PROCESSING', responseMessage: 'Searching for available account...' }, 'SIGNAL_REFRESH processing update')) return;

    // Acquire account using queue-based system (with wait if busy)
    const queueManager = getQueueManager(accountPool);
    const queueResult = await queueManager.acquireAccountWithQueue(operationId, 0, 120_000);

    if (!queueResult.account) {
        if (queueResult.timedOut) {
            throw new Error('NO_AVAILABLE_ACCOUNTS: No available accounts - queue wait timeout');
        }
        throw new Error(queueResult.error || 'NO_AVAILABLE_ACCOUNTS: No available accounts');
    }

    const account = queueResult.account;
    if (queueResult.waitTimeMs > 0) {
        console.log(`[HTTP] Operation ${operationId} waited ${Math.round(queueResult.waitTimeMs / 1000)}s in queue`);
    }
    console.log(`✅ Selected account: ${account.label || account.username} (ID: ${account.id})`);

    // Store account reference
    if (!await updateOperationIfActive(operationId, { beinAccountId: account.id }, 'SIGNAL_REFRESH account update')) {
        await accountPool.markAccountUsed(account.id);
        return;
    }

    // Get or create HTTP client for this account (includes session restore from Redis)
    const httpClient = await createOperationClient(account);

    try {
        // Step 1: Login with session caching (like other handlers)
        await updateProgress(operationId, 'Logging in...');
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
                        console.log('✅ [HTTP] CAPTCHA auto-solved: [REDACTED]');
                    } catch (autoSolveError: unknown) {
                        console.log(`⚠️ [HTTP] Auto-solve failed: ${getErrMsg(autoSolveError)}, falling back to manual`);
                    }
                } else {
                    console.log(`⚠️ [HTTP] No 2Captcha API key configured, using manual entry`);
                }

                // Fallback to manual if auto-solve failed or not configured
                if (!solution) {
                    if (!await updateOperationIfActive(operationId, {
                        status: 'AWAITING_CAPTCHA',
                        captchaImage: loginResult.captchaImage,
                        captchaExpiry: new Date(Date.now() + CAPTCHA_TIMEOUT_MS)
                    }, 'SIGNAL_REFRESH captcha update')) {
                        await releaseLoginLock(account.id, WORKER_ID);
                        await accountPool.markAccountUsed(account.id);
                        return;
                    }

                    solution = await waitForCaptchaSolution(operationId);
                    if (!solution) {
                        await releaseLoginLock(account.id, WORKER_ID);
                        throw new Error('CAPTCHA_TIMEOUT: Verification code was not entered');
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
                    await trackCredentialLoginFailure(
                        account.id,
                        loginWithCaptcha.error || 'Login failed after CAPTCHA'
                    );
                    await releaseLoginLock(account.id, WORKER_ID);
                    throw new Error(loginWithCaptcha.error || 'Login failed after CAPTCHA');
                }
                console.log('🔑 [HTTP] Login with CAPTCHA successful');
            } else if (!loginResult.success) {
                await trackCredentialLoginFailure(account.id, loginResult.error || 'Login failed');
                await releaseLoginLock(account.id, WORKER_ID);
                throw new Error(loginResult.error || 'Login failed');
            } else {
                console.log('🔑 [HTTP] Login successful');
            }

            await trackFreshLoginSuccess(account.id);

            // Save session to cache after successful login
            try {
                const sessionData = await httpClient.exportSession();
                const sessionTimeout = httpClient.getSessionTimeout();
                await saveSessionToCache(account.id, prepareSharedSessionForCache(sessionData), sessionTimeout);
                console.log(`[HTTP] 💾 Session saved to Redis cache (TTL: ${sessionTimeout} min)`);
            } catch (saveError) {
                console.error(`[HTTP] ⚠️ Failed to save session to cache:`, saveError);
            }

            // Release login lock
            await releaseLoginLock(account.id, WORKER_ID);
        }

        await checkIfCancelled(operationId);

        // Step 2: Activate signal
        await updateProgress(operationId, 'Refreshing signal...');
        const signalResult = await httpClient.activateSignal(cardNumber);

        if (!signalResult.success) {
            throw new Error(signalResult.error || 'Signal activation failed');
        }

        // Store card status in responseData
        if (!await updateOperationIfActive(operationId, {
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
        }, 'SIGNAL_REFRESH completion update')) {
            await accountPool.markAccountUsed(account.id);
            return;
        }

        // Create success notification
        const op = await prisma.operation.findUnique({
            where: { id: operationId },
            select: { userId: true }
        });

        if (op?.userId) {
            await createNotification({
                userId: op.userId,
                title: 'Signal renewal successful',
                message: signalResult.activated
                    ? `Signal renewed for card ${cardNumber}`
                    : `Card checked ${cardNumber}`,
                type: 'info'
            });
        }

        // Mark account as used
        await accountPool.markAccountUsed(account.id);

        console.log(`✅ [HTTP] Signal refresh completed for ${operationId}`);

    } catch (error: unknown) {
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
    if (!await updateOperationIfActive(operationId, { status: 'PROCESSING', responseMessage: 'Searching for available account...' }, 'SIGNAL_CHECK processing update')) return;

    // Acquire account using queue-based system (with wait if busy)
    const queueManager = getQueueManager(accountPool);
    const queueResult = await queueManager.acquireAccountWithQueue(operationId, 0, 120_000);

    if (!queueResult.account) {
        if (queueResult.timedOut) {
            throw new Error('NO_AVAILABLE_ACCOUNTS: No available accounts - queue wait timeout');
        }
        throw new Error(queueResult.error || 'NO_AVAILABLE_ACCOUNTS: No available accounts');
    }

    const account = queueResult.account;
    if (queueResult.waitTimeMs > 0) {
        console.log(`[HTTP] Operation ${operationId} waited ${Math.round(queueResult.waitTimeMs / 1000)}s in queue`);
    }
    console.log(`✅ Selected account: ${account.label || account.username}`);

    // Store account reference
    if (!await updateOperationIfActive(operationId, { beinAccountId: account.id }, 'SIGNAL_CHECK account update')) {
        await accountPool.markAccountUsed(account.id);
        return;
    }

    const httpClient = await createOperationClient(account);

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
                        console.log('✅ [HTTP] CAPTCHA auto-solved: [REDACTED]');
                    } catch (autoSolveError: unknown) {
                        console.log(`⚠️ [HTTP] Auto-solve failed: ${getErrMsg(autoSolveError)}, falling back to manual`);
                    }
                }

                // Fallback to manual if needed
                if (!solution) {
                    if (!await updateOperationIfActive(operationId, {
                        status: 'AWAITING_CAPTCHA',
                        captchaImage: loginResult.captchaImage,
                        captchaExpiry: new Date(Date.now() + CAPTCHA_TIMEOUT_MS)
                    }, 'SIGNAL_CHECK captcha update')) {
                        await releaseLoginLock(account.id, WORKER_ID);
                        await accountPool.markAccountUsed(account.id);
                        return;
                    }

                    solution = await waitForCaptchaSolution(operationId);
                    if (!solution) {
                        await releaseLoginLock(account.id, WORKER_ID);
                        throw new Error('CAPTCHA_TIMEOUT: Verification code was not entered');
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
                    await trackCredentialLoginFailure(
                        account.id,
                        loginWithCaptcha.error || 'Login failed after CAPTCHA'
                    );
                    await releaseLoginLock(account.id, WORKER_ID);
                    throw new Error(loginWithCaptcha.error || 'Login failed after CAPTCHA');
                }
            } else if (!loginResult.success) {
                await trackCredentialLoginFailure(account.id, loginResult.error || 'Login failed');
                await releaseLoginLock(account.id, WORKER_ID);
                throw new Error(loginResult.error || 'Login failed');
            }

            await trackFreshLoginSuccess(account.id);

            // Login successful - save session to Redis cache
            try {
                const loginSessionData = await httpClient.exportSession();
                const sessionTimeout = httpClient.getSessionTimeout();
                await saveSessionToCache(account.id, prepareSharedSessionForCache(loginSessionData), sessionTimeout);
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
        await saveOperationSessionToCache(operationId, sessionData, 900);

        // Store card status and await user to click activate.
        // Use 'COMPLETED' status with awaitingActivate flag to indicate waiting for user to click activate
        if (!await updateOperationIfActive(operationId, {
            status: 'COMPLETED',
            stbNumber: checkResult.cardStatus?.stbNumber,
            responseMessage: 'Card checked - ready for activation',
            responseData: JSON.stringify({
                cardStatus: checkResult.cardStatus,
                contracts: checkResult.contracts || [], // Include contracts table
                awaitingActivate: true,
                checkedAt: new Date().toISOString()
            })
        }, 'SIGNAL_CHECK completion update')) {
            await accountPool.markAccountUsed(account.id);
            return;
        }

        // Extend session TTL on successful operation
        await extendSessionTTL(account.id, httpClient.getSessionTimeout());

        await accountPool.markAccountUsed(account.id);
        console.log(`✅ [HTTP] Signal check completed for ${operationId}`);

    } catch (error: unknown) {
        await accountPool.markAccountUsed(account.id);

        // Delete session from cache on session-related errors
        if (getErrMsg(error).includes('Session expired') || getErrMsg(error).includes('login')) {
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
    const savedData = parseResponseDataObject(operation.responseData);
    delete savedData.sessionData;

    if (!savedData?.awaitingActivate) {
        throw new Error(`Operation is not awaiting activation`);
    }

    if (!operation.beinAccountId) {
        throw new Error('No account assigned to operation');
    }

    // Update status
    if (!await updateOperationIfActive(operationId, { status: 'PROCESSING', responseMessage: 'Activating signal...' }, 'SIGNAL_ACTIVATE processing update')) return;

    // Get account
    const account = await prisma.beinAccount.findUnique({
        where: { id: operation.beinAccountId },
        include: { proxy: true }  // CRITICAL: Include proxy for HTTP client
    }).then(a => a ? decryptAccountPassword(a) : null);
    if (!account) throw new Error('Account not found');

    const httpClient = await createOperationClient(account);

    try {
        // Session was parsed above as savedData - restore if available
        if (savedData.checkedAt) {
            validateSessionAge(savedData.checkedAt as string, 'signalActivate');
        }
        const restored = await restoreOperationSession(operationId, operation.responseData, httpClient);
        if (restored) console.log(`[HTTP] Restored operation-scoped session for activation`);
        // Use card number from operation or parameter
        const targetCardNumber = cardNumber || operation.cardNumber;

        // Activate signal
        const activateResult = await httpClient.activateSignalOnly(targetCardNumber);

        if (!activateResult.success) {
            throw new Error(activateResult.error || 'Activation failed');
        }

        // Update operation with result
        if (!await updateOperationIfActive(operationId, {
            status: 'COMPLETED',
            completedAt: new Date(),
            responseMessage: activateResult.activated
                ? 'Signal activated successfully'
                : activateResult.message || 'Activation not completed',
            responseData: JSON.stringify({
                ...savedData,
                cardStatus: activateResult.cardStatus,
                activated: activateResult.activated,
                awaitingActivate: false,  // Clear the flag
                activatedAt: new Date().toISOString()
            })
        }, 'SIGNAL_ACTIVATE completion update')) {
            await accountPool.markAccountUsed(account.id);
            return;
        }

        // Create notification
        if (operation.userId) {
            await createNotification({
                userId: operation.userId,
                title: activateResult.activated ? 'Signal activated' : 'Activation not completed',
                message: activateResult.activated
                    ? `Signal activated for card ${targetCardNumber}`
                    : activateResult.error || 'Error during activation',
                type: activateResult.activated ? 'success' : 'warning'
            });
        }

        await accountPool.markAccountUsed(account.id);
        await deleteOperationSessionFromCache(operationId);
        console.log(`✅ [HTTP] Signal activation completed for ${operationId}: activated=${activateResult.activated}`);

    } catch (error: unknown) {
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
    }).then(a => a ? decryptAccountPassword(a) : null);

    if (!account) {
        throw new Error(`Account ${accountId} not found`);
    }

    if (!account.isActive) {
        throw new Error(`Account ${accountId} is not active`);
    }

    // Get or create HTTP client
    const client = await createOperationClient(account);

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

        if (loginResult.requiresCaptcha && loginResult.captchaImage) {
            throw new Error('Login requires CAPTCHA for balance check');
        }

        if (!loginResult.success) {
            await trackCredentialLoginFailure(account.id, loginResult.error || 'Login failed');
            throw new Error(loginResult.error || 'Login failed');
        }

        await trackFreshLoginSuccess(account.id);

        // Save session to cache
        try {
            const sessionData = await client.exportSession();
            const sessionTimeout = client.getSessionTimeout();
            await saveSessionToCache(account.id, prepareSharedSessionForCache(sessionData), sessionTimeout);
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
        await checkAndNotifyLowBalance(accountId, account.label || account.username, balanceResult.balance);
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
    if (!await updateOperationIfActive(operationId, { status: 'PROCESSING', responseMessage: 'Searching for available account...' }, 'START_INSTALLMENT processing update')) return;

    // Get next available account with queue-based retry
    const queueManager = getQueueManager(accountPool);
    const queueResult = await queueManager.acquireAccountWithQueue(operationId, 0, 120_000);

    if (!queueResult.account) {
        if (queueResult.timedOut) {
            throw new Error('NO_AVAILABLE_ACCOUNTS: No available accounts - queue wait timeout');
        }
        throw new Error(queueResult.error || 'NO_AVAILABLE_ACCOUNTS: No available accounts');
    }

    const selectedAccount = queueResult.account;
    if (queueResult.waitTimeMs > 0) {
        console.log(`[HTTP] Operation ${operationId} waited ${Math.round(queueResult.waitTimeMs / 1000)}s in queue`);
    }

    if (!await updateOperationIfActive(operationId, { beinAccountId: selectedAccount.id }, 'START_INSTALLMENT account update')) {
        await accountPool.markAccountUsed(selectedAccount.id);
        return;
    }

    console.log(`🔑 [HTTP] Using account: ${selectedAccount.label || selectedAccount.username}`);

    // Get HTTP client for this account
    const client = await createOperationClient(selectedAccount);
    await client.reloadConfig();

    await checkIfCancelled(operationId);

    // Step 1: Login (with session caching)
    await updateProgress(operationId, 'Logging in...');
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
                    console.log('✅ [HTTP] CAPTCHA auto-solved: [REDACTED]');
                } catch (autoSolveError: unknown) {
                    console.log(`⚠️ [HTTP] Auto-solve failed: ${getErrMsg(autoSolveError)}, falling back to manual`);
                }
            }

            // Fallback to manual if auto-solve failed
            if (!solution) {
                const now = new Date();
                const heartbeatExpiry = new Date(now.getTime() + HEARTBEAT_TTL_SECONDS * 1000);

                if (!await updateOperationIfActive(operationId, {
                    status: 'AWAITING_CAPTCHA',
                    captchaImage: loginResult.captchaImage,
                    captchaExpiry: new Date(Date.now() + CAPTCHA_TIMEOUT_MS),
                    lastHeartbeat: now,
                    heartbeatExpiry: heartbeatExpiry
                }, 'START_INSTALLMENT captcha update')) {
                    await releaseLoginLock(selectedAccount.id, WORKER_ID);
                    await accountPool.markAccountUsed(selectedAccount.id);
                    return;
                }

                solution = await waitForCaptchaSolution(operationId);
                if (!solution) {
                    await releaseLoginLock(selectedAccount.id, WORKER_ID);
                    throw new Error('CAPTCHA_TIMEOUT: Verification code was not entered');
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
                await trackCredentialLoginFailure(
                    selectedAccount.id,
                    loginWithCaptcha.error || 'Login failed after CAPTCHA'
                );
                await releaseLoginLock(selectedAccount.id, WORKER_ID);
                throw new Error(loginWithCaptcha.error || 'Login failed after CAPTCHA');
            }
        } else if (!loginResult.success) {
            await trackCredentialLoginFailure(
                selectedAccount.id,
                loginResult.error || 'Login failed'
            );
            await releaseLoginLock(selectedAccount.id, WORKER_ID);
            throw new Error(loginResult.error || 'Login failed');
        }

        await trackFreshLoginSuccess(selectedAccount.id);

        // Save session to cache
        try {
            const sessionData = await client.exportSession();
            const sessionTimeout = client.getSessionTimeout();
            await saveSessionToCache(selectedAccount.id, prepareSharedSessionForCache(sessionData), sessionTimeout);
            console.log(`[HTTP] 💾 Session saved to Redis cache`);
        } catch (saveError) {
            console.error('[HTTP] Failed to save session to cache:', saveError);
        }

        await releaseLoginLock(selectedAccount.id, WORKER_ID);
    }

    await checkIfCancelled(operationId);

    // Step 2: Load installment details
    await updateProgress(operationId, 'Loading installment data...');
    console.log(`[HTTP] Loading installment for card ${cardNumber}`);

    const installmentResult = await client.loadInstallment(cardNumber);

    if (!installmentResult.success) {
        throw new Error(installmentResult.error || 'Failed to load installment');
    }

    if (!installmentResult.hasInstallment) {
        // No installment found - complete with message
        if (!await updateOperationIfActive(operationId, {
            status: 'COMPLETED',
            responseMessage: 'No installments found for this card',
            completedAt: new Date()
        }, 'START_INSTALLMENT no-installment completion update')) {
            await accountPool.markAccountUsed(selectedAccount.id);
            return;
        }

        // Release account
        await accountPool.markAccountUsed(selectedAccount.id);
        return;
    }

    // Installment found - save details and wait for user confirmation
    const now = new Date();
    const confirmExpiry = new Date(now.getTime() + 60_000); // 60 seconds to confirm
    const heartbeatExpiry = new Date(now.getTime() + HEARTBEAT_TTL_SECONDS * 1000);

    if (!await updateOperationIfActive(operationId, {
        status: 'AWAITING_FINAL_CONFIRM',
        // Store installment data in responseData
        responseData: JSON.stringify({
            installment: installmentResult.installment || null,
            subscriber: installmentResult.subscriber || null,
            dealerBalance: installmentResult.dealerBalance || null,
            dealerBalanceBefore: installmentResult.dealerBalance || null,
            operationPhase: 'FINAL_CONFIRMATION_REQUESTED',
            jobType: 'START_INSTALLMENT',
            finalPaySubmitted: false,
            isInstallment: true // Flag to identify installment operations
        }),
        stbNumber: installmentResult.subscriber?.stbModel || null,
        amount: 0, // CRITICAL: Set to 0 initially. Only set full amount AFTER user pays in confirm-installment API, to prevent free money refunds on timeout.
        finalConfirmExpiry: confirmExpiry,
        lastHeartbeat: now,
        heartbeatExpiry: heartbeatExpiry
    }, 'START_INSTALLMENT final confirm update')) {
        await accountPool.markAccountUsed(selectedAccount.id);
        return;
    }

    await accountPool.markAccountUsed(selectedAccount.id);

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

    if (isTerminalStatus(operation.status)) {
        console.log(`⏭️ [HTTP] Operation ${operationId} already terminal (${operation.status}), skipping CONFIRM_INSTALLMENT`);
        return;
    }

    const movedToCompleting = await prisma.operation.updateMany({
        where: {
            id: operationId,
            status: { in: ['AWAITING_FINAL_CONFIRM', 'COMPLETING'] }
        },
        data: {
            status: 'COMPLETING',
            responseMessage: 'Confirming installment payment...'
        }
    });
    if (movedToCompleting.count === 0) {
        const current = await prisma.operation.findUnique({
            where: { id: operationId },
            select: { status: true }
        });
        if (isTerminalStatus(current?.status)) {
            console.log(`[HTTP] Operation ${operationId} moved to terminal state (${current?.status}), skipping CONFIRM_INSTALLMENT`);
            return;
        }
        throw new Error(`Invalid status for CONFIRM_INSTALLMENT: ${current?.status || operation.status}`);
    }

    const selectedAccount = operation.beinAccount;

    // Get HTTP client
    const client = await createOperationClient(selectedAccount);
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
            if (loginResult.requiresCaptcha && loginResult.captchaImage) {
                throw new Error('Login requires CAPTCHA for installment confirm');
            }
            if (!loginResult.success) {
                await trackCredentialLoginFailure(
                    selectedAccount.id,
                    loginResult.error || 'Login failed'
                );
                throw new Error(loginResult.error || 'Login failed for installment confirm');
            }
            await trackFreshLoginSuccess(selectedAccount.id);
            // Save session to cache
            try {
                const sessionData = await client.exportSession();
                const sessionTimeout = client.getSessionTimeout();
                await saveSessionToCache(selectedAccount.id, prepareSharedSessionForCache(sessionData), sessionTimeout);
            } catch (saveError) {
                console.error('[HTTP] Failed to save session to cache:', saveError);
            }
        }
    }

    await checkIfCancelled(operationId);

    // Re-load installment to ensure card is loaded and ViewState is fresh
    await updateProgress(operationId, 'Loading installment data...');
    console.log(`[HTTP] Re-loading installment for card ${cardNumber} before payment...`);
    const loadResult = await client.loadInstallment(cardNumber);

    if (!loadResult.success || !loadResult.hasInstallment) {
        if (operation.userId && operation.amount && operation.amount > 0) {
            await refundUser(operationId, operation.userId, operation.amount, loadResult.error || 'Failed to re-load installment');
        }
        await markOperationFailed(operationId, { type: 'UNKNOWN', message: loadResult.error || 'Failed to re-load installment before payment', recoverable: false }, 1);
        return;
    }

    await checkIfCancelled(operationId);

    // Execute payment
    await updateProgress(operationId, 'Processing payment...');
    console.log(`[HTTP] Executing installment payment...`);
    const operationResponseData = parseResponseDataObject(operation.responseData);
    const preFinalInstallmentBalance =
        toNullableNumber(loadResult.dealerBalance) ??
        toNullableNumber(operationResponseData.dealerBalanceBefore) ??
        toNullableNumber(operationResponseData.dealerBalance);
    const rawPayResult = await client.payInstallment();
    const payResult = {
        ...rawPayResult,
        beinBalanceBefore: toNullableNumber(rawPayResult.beinBalanceBefore) ?? preFinalInstallmentBalance ?? undefined
    };
    const payOutcomeDecision = decideFinalPayRefundSafety(payResult, true);

    if (payResult.success) {
        const completed = await prisma.operation.updateMany({
            where: {
                id: operationId,
                status: { notIn: TERMINAL_STATUS_LIST }
            },
            data: {
                status: 'COMPLETED',
                responseMessage: payResult.message,
                completedAt: new Date(),
                finalConfirmExpiry: null
            }
        });
        if (completed.count === 0) {
            console.warn(`[HTTP] CONFIRM_INSTALLMENT completion skipped for ${operationId} due to terminal transition race`);
            return;
        }

        const ledgerResult = operation.userId
            ? await recordConfirmedBeinSpend({
                operationId,
                userId: operation.userId,
                beinAccountId: selectedAccount.id,
                dealerBalanceBefore: toNullableNumber(payResult.beinBalanceBefore),
                dealerBalanceAfter: toNullableNumber(payResult.beinBalanceAfter),
                evidenceSource: 'BALANCE_DELTA',
            })
            : null;
        if (ledgerResult?.status === 'conflict_review_required') {
            console.warn(`[HTTP] beIN spend ledger conflict for ${operationId}: ${ledgerResult.reason}`);
        }

        const auditSnapshot = await buildOperationAuditSnapshot({
            operationId,
            userId: operation.userId || null,
            beinAccountId: selectedAccount.id,
            beinUsername: selectedAccount.username,
            beinBalanceBefore: toNullableNumber(payResult.beinBalanceBefore),
            beinBalanceAfter: toNullableNumber(payResult.beinBalanceAfter),
            chargedBeinLedgerId: ledgerResult && 'ledgerId' in ledgerResult ? ledgerResult.ledgerId : undefined
        });
        await persistOperationAuditSnapshot(operationId, operation.responseData, auditSnapshot);

        try {
            await accountPool.markAccountUsed(selectedAccount.id);
        } catch (e: unknown) {
            console.error(`[HTTP] Failed to mark account used after installment completion for ${operationId}: ${getErrMsg(e)}`);
        }

        if (operation.userId) {
            try {
                await trackOperationComplete(
                    operation.userId,
                    operationId,
                    'RENEW',
                    operation.amount,
                    {
                        type: 'installment',
                        cardNumber,
                        beinAccountId: selectedAccount.id,
                        beinUsernameSnapshot: auditSnapshot.beinUsername,
                        beinBalanceBefore: auditSnapshot.beinBalanceBefore,
                        beinBalanceAfter: auditSnapshot.beinBalanceAfter,
                        userBalanceBefore: auditSnapshot.userBalanceBefore,
                        userBalanceAfter: auditSnapshot.userBalanceAfter
                    }
                );

                await detectAndRecordOperationIntegrity({
                    operationId,
                    beinBalanceBefore: auditSnapshot.beinBalanceBefore ?? undefined,
                    beinBalanceAfter: auditSnapshot.beinBalanceAfter ?? undefined,
                    beinUsernameSnapshot: auditSnapshot.beinUsername ?? undefined,
                    userBalanceBefore: auditSnapshot.userBalanceBefore ?? undefined,
                    userBalanceAfter: auditSnapshot.userBalanceAfter ?? undefined
                });
            } catch (e: unknown) {
                console.error(`[HTTP] Failed to track installment completion for ${operationId}: ${getErrMsg(e)}`);
            }
        }

        if (operation.userId) {
            try {
                await createNotification({
                    userId: operation.userId,
                    title: 'Installment paid',
                    message: `Installment paid for card ${cardNumber} successfully`,
                    type: 'success',
                    link: '/dashboard/history'
                });
            } catch (e: unknown) {
                console.error(`[HTTP] Failed to create installment notification for ${operationId}: ${getErrMsg(e)}`);
            }
        }

        console.log(`✅ [HTTP] Installment payment completed`);
        return;
    }

    if (payOutcomeDecision.reviewRequired || !payOutcomeDecision.refundSafe) {
        const reviewRequired = await prisma.operation.updateMany({
            where: {
                id: operationId,
                status: { notIn: TERMINAL_STATUS_LIST }
            },
            data: {
                status: 'REVIEW_REQUIRED',
                responseMessage: payResult.message,
                finalConfirmExpiry: null
            }
        });
        if (reviewRequired.count === 0) {
            console.warn(`[HTTP] CONFIRM_INSTALLMENT review update skipped for ${operationId} due to terminal transition race`);
            return;
        }

        const ledgerResult = operation.userId
            ? await recordConfirmedBeinSpend({
                operationId,
                userId: operation.userId,
                beinAccountId: selectedAccount.id,
                dealerBalanceBefore: toNullableNumber(payResult.beinBalanceBefore),
                dealerBalanceAfter: toNullableNumber(payResult.beinBalanceAfter),
                evidenceSource: 'BALANCE_DELTA',
            })
            : null;
        if (ledgerResult?.status === 'conflict_review_required') {
            console.warn(`[HTTP] beIN spend ledger conflict for ${operationId}: ${ledgerResult.reason}`);
        }

        const auditSnapshot = await buildOperationAuditSnapshot({
            operationId,
            userId: operation.userId || null,
            beinAccountId: selectedAccount.id,
            beinUsername: selectedAccount.username,
            beinBalanceBefore: toNullableNumber(payResult.beinBalanceBefore),
            beinBalanceAfter: toNullableNumber(payResult.beinBalanceAfter),
            outcomeCategory: payOutcomeDecision.outcomeCategory,
            reviewReason: payResult.message,
            reviewSource: 'confirm-installment',
            refundBlocked: true,
            chargedBeinLedgerId: ledgerResult && 'ledgerId' in ledgerResult ? ledgerResult.ledgerId : undefined
        });
        await persistOperationAuditSnapshot(operationId, operation.responseData, auditSnapshot);

        try {
            await accountPool.markAccountUsed(selectedAccount.id);
        } catch (e: unknown) {
            console.error(`[HTTP] Failed to mark account used after REVIEW_REQUIRED for ${operationId}: ${getErrMsg(e)}`);
        }
        console.warn(`[HTTP] Installment payment for ${operationId} moved to REVIEW_REQUIRED (${payOutcomeDecision.outcomeCategory}): ${payResult.message}`);
        return;
    }

    if (operation.userId && operation.amount && operation.amount > 0) {
        await refundUser(operationId, operation.userId, operation.amount, payResult.message);
    }
    await markOperationFailed(operationId, { type: 'UNKNOWN', message: payResult.message, recoverable: false }, 1);
    return;
}

/**
 * Cleanup all HTTP clients
 */
export function closeAllHttpClients(): void {
    console.log('[HTTP] No shared HTTP clients to close');
}

/**
 * Get the httpClients map for external use (e.g., SessionKeepAlive)
 */
export function getHttpClientsMap(): Map<string, HttpClientService> {
    return new Map<string, HttpClientService>();
}
