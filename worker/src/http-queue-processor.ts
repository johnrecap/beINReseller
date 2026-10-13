import { deliverCompletionEffects } from '../../shared/operations/completion-effects';

/**
 * HTTP Queue Processor - Handles operations using HttpClientService
 * 
 * This is a parallel implementation to queue-processor.ts that uses
 * direct HTTP requests instead of Playwright for better performance.
 * 
 * @see queue-processor.ts for the Playwright version
 */

import { randomUUID } from 'node:crypto';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { prisma } from './lib/prisma';
import { HttpClientService, AvailablePackage, classifyFinalPayOutcome, type LoadPackagesResult } from './http';
import type { FinalPayOutcomeCategory, PayInstallmentResult, PurchaseResult } from './http';
import { AccountPoolManager, getQueueManager, lockAccount, unlockAccount } from './pool';
import {
    acquireAccountExecutionLease,
    assertAccountExecutionLease,
    extendLock,
    getAccountLockStatus,
    isAccountExecutionLeaseActive,
    parkAccountLockForHandoff,
    transitionAccountLockToExecutionLease,
    type AccountExecutionLeaseHandle,
} from './pool/account-locking';
import { refundUser, markOperationFailed } from './utils/error-handler';
import { createNotification, notifyAdminLowBalance, checkAndNotifyLowBalance } from './utils/notification';
import { CaptchaSolver } from './utils/captcha-solver';
import { BeinAccount, OperationStatus, Prisma, Proxy } from '@prisma/client';
import { trackOperationComplete } from './lib/activity-tracker';
import { detectAndRecordOperationIntegrity } from './lib/integrity-detector';
import { decryptAccountPassword } from './lib/crypto';
import { recordConfirmedBeinSpend } from './lib/bein-spend-ledger';
import { claimInstallmentMutation, finalizeInstallmentSettlement } from './lib/installment-finalization';
import { installmentIdentity } from '../../shared/operations/audit-financial-context';
import { actionRevision, quoteData, quoteRevisionOf, readyPackageQuote, type PromoAction, type QuotePackage } from '../../shared/operations/package-quote';
import { holdQuoteConflict, isCurrentPromo, matchFreshPackage, publishPromoQuote, refreshPromoPackages } from './lib/promo-quote';
import { getRedisConnection } from './lib/redis';
import {
    captureOperationSpendAwardRunInTransaction,
    finalizeOperationSpendAwardRun,
} from './lib/points';
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
    waitForLoginComplete,
    saveSessionToCacheFenced,
    saveOperationSessionToCacheFenced,
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
import {
    BEIN_CONNECTION_MODE_SETTING_KEY,
    DEFAULT_BEIN_CONNECTION_MODE,
    buildOperationRouteSnapshot,
    getOperationRouteSnapshot,
    mergeOperationRouteSnapshot,
    prepareRetryAccountResponseData,
    resolveBeinRoute,
    resolveRetryAccountRoute,
    type EffectiveBeinRoute,
} from './lib/bein-connection-mode';
import {
    buildFinalPayBalanceEvidence,
    shouldRecordConfirmedProviderSpend,
    type FinalPayBalanceEvidence,
} from './lib/final-pay-evidence';
import type { FulfillmentProofCandidate } from './lib/fulfillment-proof';
import { finalizeAutomatedRenewalFulfillment } from './lib/fulfillment-finalization';
import {
    cairoReportDay, claimSameDayFinalMutation, correlateSameDayReport,
    finalizeSameDayReport, markSameDayPayRequest, recordSameDayAttempt,
} from './lib/same-day-report-fulfillment';
import { finalizeRenewalNoChargeFailure } from './lib/renewal-no-charge-finalization';
import { finalizePreMutationRenewalTermination } from './lib/pre-mutation-renewal-finalization';
import { lockFinancialOperation } from '../../shared/operations/financial-lock';
import {
    RetryableRenewalVerificationError,
    isTransientRenewalVerificationError,
} from './lib/renewal-verification-retry';
import {
    captureRenewalFulfillmentBaseline,
    claimFinalProviderMutationStart,
    getActiveRenewalFulfillmentBaseline,
    getRenewalFulfillmentConfig,
    markFulfillmentVerificationAttemptProofConflict,
    persistRenewalFulfillmentState,
    recordFulfillmentVerificationAttempt,
    supersedeRenewalFulfillmentBaseline,
} from './lib/fulfillment-baseline';
import {
    acquireProviderAccountCausalReservation,
    assertActiveProviderAccountReservation,
    decideProviderAccountConsumerAccess,
    findActiveProviderAccountReservationForAccount,
    releaseProviderAccountCausalReservation,
    type ProviderAccountConsumer,
} from './lib/provider-account-reservation';
import {
    correlateRenewalFulfillment,
    boundPurchaseIdentity,
    type RenewalFulfillmentCorrelationResult,
} from './lib/renewal-fulfillment-correlation';
import {
    decideRenewalTerminalState,
    mapVerificationOutcomeToFulfillmentState,
    type FulfillmentProofMode,
    type FulfillmentState,
    type FulfillmentVerificationOutcome,
    type ProviderPaymentState,
} from '../../shared/operations/renewal-fulfillment';

// Renewal decision windows
const HEARTBEAT_TTL_SECONDS = 5;
const PACKAGE_SELECTION_TIMEOUT_MS = 30_000;
const CONFIRMATION_TIMEOUT_MS = 10_000;
const FINAL_CONFIRM_LOCK_WAIT_TIMEOUT_MS = 10_000;
const FINAL_PROVIDER_MUTATION_PHASE = 'FINAL_PROVIDER_MUTATION_STARTED';
const BALANCE_ACCOUNT_LOCK_TTL_SECONDS = 120;
const BALANCE_ACCOUNT_LOCK_HEARTBEAT_MS = 30_000;

interface OperationJobData {
    operationId: string;
    type: 'RENEW' | 'CHECK_BALANCE' | 'REFRESH_SIGNAL' | 'SIGNAL_REFRESH' | 'START_RENEWAL' | 'COMPLETE_PURCHASE' | 'APPLY_PROMO' | 'CONFIRM_PURCHASE' | 'CANCEL_CONFIRM' | 'SIGNAL_CHECK' | 'SIGNAL_ACTIVATE' | 'CHECK_ACCOUNT_BALANCE' | 'START_INSTALLMENT' | 'CONFIRM_INSTALLMENT' | 'VERIFY_RENEWAL_FULFILLMENT' | 'VERIFY_REVIEW_CARD';
    cardNumber: string;
    duration?: string;
    promoCode?: string;
    promoAction?: PromoAction;
    actionRevision?: number;
    userId?: string;
    amount?: number;
    accountId?: string;  // For CHECK_ACCOUNT_BALANCE
    smartcardType?: string;  // 'CISCO' or 'IRDETO' (default: CISCO)
    verificationAttempt?: number;
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
const HARD_TERMINAL_STATUS_LIST: OperationStatus[] = [
    OperationStatus.COMPLETED,
    OperationStatus.CANCELLED,
    OperationStatus.FAILED,
    OperationStatus.EXPIRED
];

const TERMINAL_STATUSES = new Set<string>(TERMINAL_STATUS_LIST);

type ProviderEvidenceState = 'confirmed-final-pay' | 'contract-verified' | 'incomplete-evidence';

function isTerminalStatus(status: string | null | undefined): boolean {
    return !!status && TERMINAL_STATUSES.has(status);
}

class QuoteHoldPersistenceError extends Error {}

async function awardCompletedOperationPointsSafely(operationId: string): Promise<void> {
    try {
        await finalizeOperationSpendAwardRun(prisma, operationId);
    } catch (error) {
        console.error(`[HTTP] Point finalization failed for completed operation ${operationId}:`, error);
    }
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
        directOkSuccess?: boolean;
        reportDate?: string;
        finalPayRequestStartedAt?: string;
        finalProviderMutationStartedAt?: string;
        providerMutationStage?: 'FINAL_OK';
        dealerBalanceBefore?: number | null;
        dealerBalanceAfter?: number | null;
        dealerBalanceBeforeSource?: FinalPayBalanceEvidence['finalBalanceBeforeSource'] | FinalPayBalanceEvidence['diagnosticBalanceBeforeSource'];
        dealerBalanceAfterSource?: FinalPayBalanceEvidence['finalBalanceAfterSource'];
        diagnosticDealerBalanceBefore?: number | null;
        diagnosticDealerBalanceBeforeSource?: FinalPayBalanceEvidence['diagnosticBalanceBeforeSource'];
        providerEvidenceState?: ProviderEvidenceState;
        providerPaymentState?: ProviderPaymentState;
        fulfillmentState?: FulfillmentState;
        fulfillmentProofId?: string;
        fulfillmentInvoiceNo?: string;
        fulfillmentReasonCode?: string;
        verificationOutcome?: FulfillmentVerificationOutcome;
        nextVerificationAt?: string | null;
        fulfillmentProofMode?: FulfillmentProofMode;
        proofKind?: 'LEGACY_CONTRACT_ONLY' | 'SOLD_REPORT_CONTRACT_CORRELATION' | 'SOLD_REPORT_SAME_DAY';
        providerEvidenceCapturedAt?: string;
        providerEvidenceContext?: {
            operationId: string;
            beinAccountId: string | null;
            cardNumber: string | null;
            packageName: string | null;
            packagePrice: number | null;
            contextMatched: boolean;
        };
        expectedCost?: number | null;
        outcomeCategory?: FinalPayOutcomeCategory;
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
    if (
        phase === 'PROVIDER_SALE_PREPARATION_STARTED' ||
        phase === 'FINAL_PROVIDER_MUTATION_STARTED' ||
        phase === 'FINAL_PAY_REQUEST_STARTED' ||
        phase === 'FINAL_PAY_SUBMITTED' ||
        phase === 'POST_FINAL_PAY_REVIEW'
    ) return true;
    if (
        phase === 'PACKAGE_PREPARATION' ||
        phase === 'CANCELLATION_CONFIRM' ||
        phase === 'FINAL_CONFIRMATION' ||
        phase === 'FINAL_CONFIRMATION_REQUESTED' ||
        phase === 'DISPATCH_PENDING' ||
        phase === 'DISPATCH_FAILED'
    ) {
        return false;
    }

    return status === OperationStatus.COMPLETING;
}

function hasExplicitFinalPaymentStarted(responseData?: unknown): boolean {
    const data = parseResponseDataObject(responseData);
    const phase = getOperationPhase(responseData);

    return data.finalPaySubmitted === true ||
        phase === 'PROVIDER_SALE_PREPARATION_STARTED' ||
        phase === 'FINAL_PROVIDER_MUTATION_STARTED' ||
        phase === 'FINAL_PAY_REQUEST_STARTED' ||
        phase === 'FINAL_PAY_SUBMITTED' ||
        phase === 'POST_FINAL_PAY_REVIEW';
}

function hasRenewalFinalPayDispatchEvidence(
    status: OperationStatus | string | null | undefined,
    responseData?: unknown
): boolean {
    const phase = getOperationPhase(responseData);

    if (phase === 'DISPATCH_PENDING' || phase === 'DISPATCH_FAILED') return true;
    return !phase && status === OperationStatus.COMPLETING;
}

function shouldSubmitRenewalFinalPay(operation: {
    status: OperationStatus | string | null | undefined;
    amount: number | null | undefined;
    responseData?: unknown;
    providerMutationStartedAt?: Date | null;
    providerMutationStage?: string | null;
} | null): { allowed: boolean; reason: string } {
    if (!operation) return { allowed: false, reason: 'missing_operation' };
    if (isTerminalStatus(operation.status)) return { allowed: false, reason: `terminal_${operation.status}` };
    if (operation.status !== OperationStatus.COMPLETING && operation.status !== OperationStatus.AWAITING_FINAL_CONFIRM) {
        return { allowed: false, reason: `invalid_status_${operation.status}` };
    }
    if (!operation.amount || operation.amount <= 0) return { allowed: false, reason: 'missing_amount' };
    if (
        operation.providerMutationStartedAt ||
        operation.providerMutationStage ||
        hasExplicitFinalPaymentStarted(operation.responseData)
    ) {
        return { allowed: false, reason: 'final_provider_mutation_already_started' };
    }
    if (!hasRenewalFinalPayDispatchEvidence(operation.status, operation.responseData)) {
        return { allowed: false, reason: 'missing_dispatch_evidence' };
    }
    return { allowed: true, reason: 'allowed' };
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
    const finalPaySubmittedForDecision = result.finalPaySubmitted === true || finalPaySubmitted;
    const shouldReclassifyConservativeNoCharge =
        finalPaySubmittedForDecision &&
        result.finalPaySubmitted !== true &&
        result.outcomeCategory === 'CONFIRMED_NOT_CHARGED';
    const outcomeCategory = !shouldReclassifyConservativeNoCharge && result.outcomeCategory
        ? result.outcomeCategory
        : classifyFinalPayOutcome({
            success: result.success,
            message: result.message,
            finalPaySubmitted: finalPaySubmittedForDecision,
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
    beinBalanceBeforeSource?: FinalPayBalanceEvidence['finalBalanceBeforeSource'];
    beinBalanceAfterSource?: FinalPayBalanceEvidence['finalBalanceAfterSource'];
    diagnosticDealerBalanceBefore?: number | null;
    diagnosticDealerBalanceBeforeSource?: FinalPayBalanceEvidence['diagnosticBalanceBeforeSource'];
    providerEvidenceState?: ProviderEvidenceState;
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

type ConfirmedBeinSpendResult = Awaited<ReturnType<typeof recordConfirmedBeinSpend>>;

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

function getStoredProviderPaymentState(responseData: unknown): ProviderPaymentState | null {
    const state = parseResponseDataObject(responseData).providerPaymentState;
    switch (state) {
        case 'NOT_SUBMITTED':
        case 'CHARGED':
        case 'NOT_CHARGED':
        case 'UNKNOWN':
            return state;
        default:
            return null;
    }
}

function hasReviewFinalPaymentEvidence(responseData: unknown): boolean {
    if (hasExplicitFinalPaymentStarted(responseData)) return true;

    const data = parseResponseDataObject(responseData);
    const providerPaymentState = getStoredProviderPaymentState(data);
    if (providerPaymentState && providerPaymentState !== 'NOT_SUBMITTED') return true;

    const auditSnapshot = data.auditSnapshot && typeof data.auditSnapshot === 'object' && !Array.isArray(data.auditSnapshot)
        ? data.auditSnapshot as Record<string, unknown>
        : {};
    const outcomeCategory = data.outcomeCategory ?? auditSnapshot.outcomeCategory;
    const providerEvidenceState = data.providerEvidenceState ?? auditSnapshot.providerEvidenceState;
    return outcomeCategory === 'CONFIRMED_SUCCESS' ||
        outcomeCategory === 'CONFIRMED_NOT_CHARGED' ||
        outcomeCategory === 'UNCERTAIN_REVIEW_REQUIRED' ||
        providerEvidenceState === 'confirmed-final-pay' ||
        providerEvidenceState === 'contract-verified';
}

type OperationBeinAccount = BeinAccount & { proxy?: Proxy | null };

async function getCurrentBeinConnectionMode(): Promise<string> {
    try {
        const setting = await prisma.setting.findUnique({
            where: { key: BEIN_CONNECTION_MODE_SETTING_KEY },
            select: { value: true }
        });
        return setting?.value || DEFAULT_BEIN_CONNECTION_MODE;
    } catch (error) {
        console.warn(`[HTTP] Failed to load beIN connection mode, using default: ${getErrMsg(error)}`);
        return DEFAULT_BEIN_CONNECTION_MODE;
    }
}

function safeRouteLogSuffix(route: EffectiveBeinRoute): string {
    if (route.proxyId) {
        return `mode=${route.mode} routeKey=${route.routeKey} using assigned proxy=${route.proxyLabel || route.proxyId}`;
    }

    if (route.mode === 'server_ip') {
        return `mode=${route.mode} routeKey=${route.routeKey} using emergency server IP; assigned proxy ignored`;
    }

    return `mode=${route.mode} routeKey=${route.routeKey} using direct server IP; no assigned proxy`;
}

async function resolveOperationRoute(
    account: OperationBeinAccount,
    options: {
        operationId: string;
        responseData?: unknown;
        legacyFallback?: boolean;
        ignoreSnapshot?: boolean;
    }
): Promise<EffectiveBeinRoute> {
    const mode = await getCurrentBeinConnectionMode();
    const snapshot = options.ignoreSnapshot
        ? null
        : getOperationRouteSnapshot(options.responseData);
    const route = resolveBeinRoute(account, {
        mode,
        operationId: options.operationId,
        snapshot,
        legacyFallback: options.legacyFallback
    });
    console.log(
        `[HTTP] beIN route for ${options.operationId} (${account.label || account.username}): ${safeRouteLogSuffix(route)}`
    );
    return route;
}

function responseDataWithRoute(
    responseData: unknown,
    route: EffectiveBeinRoute
): Prisma.InputJsonObject {
    return mergeOperationRouteSnapshot(
        responseData,
        buildOperationRouteSnapshot(route)
    ) as Prisma.InputJsonObject;
}

async function buildOperationAuditSnapshot(params: {
    operationId: string;
    userId: string | null;
    beinAccountId: string | null;
    beinUsername: string | null;
    beinBalanceBefore: number | null;
    beinBalanceAfter: number | null;
    beinBalanceBeforeSource?: FinalPayBalanceEvidence['finalBalanceBeforeSource'];
    beinBalanceAfterSource?: FinalPayBalanceEvidence['finalBalanceAfterSource'];
    diagnosticDealerBalanceBefore?: number | null;
    diagnosticDealerBalanceBeforeSource?: FinalPayBalanceEvidence['diagnosticBalanceBeforeSource'];
    providerEvidenceState?: ProviderEvidenceState;
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
        beinBalanceBeforeSource,
        beinBalanceAfterSource,
        diagnosticDealerBalanceBefore,
        diagnosticDealerBalanceBeforeSource,
        providerEvidenceState,
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
    const hasConfirmedFinalPaySources =
        beinBalanceBeforeSource === 'final_pay_ok_page' &&
        (
            beinBalanceAfterSource === 'final_pay_result_page' ||
            beinBalanceAfterSource === 'final_pay_balance_check'
        );
    const beinDelta =
        before === null || after === null || !hasConfirmedFinalPaySources
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
    if (beinBalanceBeforeSource !== undefined) snapshot.beinBalanceBeforeSource = beinBalanceBeforeSource;
    if (beinBalanceAfterSource !== undefined) snapshot.beinBalanceAfterSource = beinBalanceAfterSource;
    if (diagnosticDealerBalanceBefore !== undefined) snapshot.diagnosticDealerBalanceBefore = toNullableNumber(diagnosticDealerBalanceBefore);
    if (diagnosticDealerBalanceBeforeSource !== undefined) snapshot.diagnosticDealerBalanceBeforeSource = diagnosticDealerBalanceBeforeSource;
    if (providerEvidenceState !== undefined) snapshot.providerEvidenceState = providerEvidenceState;
    if (outcomeCategory !== undefined) snapshot.outcomeCategory = outcomeCategory;
    if (reviewReason !== undefined) snapshot.reviewReason = reviewReason;
    if (reviewSource !== undefined) snapshot.reviewSource = reviewSource;
    if (refundBlocked !== undefined) snapshot.refundBlocked = refundBlocked;
    if (chargedBeinLedgerId !== undefined) snapshot.chargedBeinLedgerId = chargedBeinLedgerId;
    return snapshot;
}

function mergeOperationAuditSnapshot(
    responseData: unknown,
    snapshot: OperationAuditSnapshot
): Prisma.InputJsonObject {
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

    return merged as Prisma.InputJsonObject;
}

async function persistOperationAuditSnapshot(
    operationId: string,
    responseData: unknown,
    snapshot: OperationAuditSnapshot
): Promise<void> {
    const merged = mergeOperationAuditSnapshot(responseData, snapshot);

    await prisma.operation.update({
        where: { id: operationId },
        data: {
            responseData: merged
        }
    });
}

function renewalProviderPaymentState(
    result: PurchaseResult,
    markerClaimed: boolean
): ProviderPaymentState {
    if (!markerClaimed) return 'NOT_SUBMITTED';
    if (result.outcomeCategory === 'CONFIRMED_SUCCESS') return 'CHARGED';

    const message = result.message.toLowerCase();
    const deterministicRejection = result.finalPaySubmitted === true && (
        message.includes('insufficient balance') ||
        message.includes('insufficient credit') ||
        message.includes('transaction failed on bein')
    );
    return result.outcomeCategory === 'CONFIRMED_NOT_CHARGED' && deterministicRejection
        ? 'NOT_CHARGED'
        : 'UNKNOWN';
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function ledgerResultBlocksCompletion(result: ConfirmedBeinSpendResult | null): boolean {
    return result?.status === 'conflict_review_required' || result?.status === 'missing_balance_delta';
}

function spendLedgerAccountMismatch(operation: {
    beinAccountId: string | null;
    chargedBeinSpendLedger: { beinAccountId: string } | null;
}): boolean {
    return Boolean(
        operation.chargedBeinSpendLedger &&
        (!operation.beinAccountId ||
            operation.chargedBeinSpendLedger.beinAccountId !== operation.beinAccountId)
    );
}

function ledgerResultId(result: ConfirmedBeinSpendResult | null): string | undefined {
    return result && 'ledgerId' in result ? result.ledgerId : undefined;
}

function ledgerResultReviewReason(result: ConfirmedBeinSpendResult | null): string | undefined {
    if (result?.status === 'conflict_review_required' || result?.status === 'missing_balance_delta') {
        return result.reason;
    }
    return undefined;
}

async function upsertRenewalFulfillmentSafetyIssue(input: {
    operationId: string;
    userId: string | null;
    beinAccountId: string;
    operationAmount: number | null;
    issueType: 'PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED' | 'FULFILLMENT_PROOF_CONFLICT';
    details: Prisma.InputJsonObject;
}): Promise<void> {
    await prisma.operationIntegrityIssue.upsert({
        where: {
            operationId_issueType: {
                operationId: input.operationId,
                issueType: input.issueType,
            },
        },
        create: {
            operationId: input.operationId,
            userId: input.userId,
            beinAccountId: input.beinAccountId,
            issueType: input.issueType,
            severity: 'HIGH',
            status: 'OPEN',
            operationAmount: input.operationAmount,
            details: input.details,
        },
        update: {
            lastSeenAt: new Date(),
            details: input.details,
        },
    });
}

async function resolveRenewalFulfillmentSafetyIssues(operationId: string): Promise<void> {
    await prisma.operationIntegrityIssue.updateMany({
        where: {
            operationId,
            issueType: {
                in: [
                    'PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED',
                    'FULFILLMENT_PROOF_CONFLICT',
                ],
            },
            status: { in: ['OPEN', 'ACKNOWLEDGED'] },
        },
        data: {
            status: 'RESOLVED',
            reviewedAt: new Date(),
            reviewNote: 'Resolved automatically after unique fulfillment proof was committed.',
        },
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
    client: HttpClientService,
    route: EffectiveBeinRoute
): Promise<boolean> {
    const cachedSession = await getOperationSessionFromCache(operationId, route);
    if (cachedSession) {
        await client.importSession(cachedSession);
        client.markSessionValidFromCache(cachedSession.expiresAt);
        return true;
    }

    const legacySession = getLegacySessionData(responseData);
    if (legacySession && route.mode === 'server_ip') {
        console.log(`[HTTP] Skipping legacy operation session for ${operationId}; route is server_ip`);
        return false;
    }

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
function prepareSharedSessionForCache<T extends { viewState?: unknown; renewalSelection?: unknown; preparedRenewal?: unknown }>(sessionData: T): T {
    sessionData.viewState = undefined;
    sessionData.renewalSelection = undefined;
    sessionData.preparedRenewal = undefined;
    return sessionData;
}

/**
 * Create a fresh HTTP client for a single operation.
 * Each operation gets its own CookieJar/ViewState chain while still
 * cloning cookies from the shared Redis session when available.
 */
async function createOperationClient(account: OperationBeinAccount, route: EffectiveBeinRoute): Promise<HttpClientService> {
    const client = new HttpClientService(route.proxyConfig, account.id);
    await client.initialize();
    console.log(`[HTTP] Created operation client for ${account.username}: ${safeRouteLogSuffix(route)}`);

    try {
        const cachedSession = await getSessionFromCache(account.id, route.routeKey);
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
        await deleteSessionFromCache(account.id, route.routeKey);
    }

    return client;
}

export async function createProviderReportClient(account: OperationBeinAccount): Promise<HttpClientService> {
    const route = await resolveOperationRoute(account, { operationId: `report:${account.id}`, ignoreSnapshot: true });
    return createOperationClient(account, route);
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

function isProviderExecutionLeaseLostError(error: unknown): boolean {
    return getErrMsg(error).startsWith('PROVIDER_EXECUTION_LEASE_LOST');
}

async function assertReLoginExecutionLeaseCurrent(
    executionLease?: AccountExecutionLeaseHandle
): Promise<void> {
    if (!executionLease) return;

    try {
        if (await assertAccountExecutionLease(getRedisConnection(), executionLease)) return;
    } catch (error: unknown) {
        if (isProviderExecutionLeaseLostError(error)) throw error;
        throw new Error('PROVIDER_EXECUTION_LEASE_LOST_ASSERT_FAILED');
    }

    throw new Error('PROVIDER_EXECUTION_LEASE_LOST_DURING_RELOGIN');
}

async function waitForReLoginRetry(
    executionLease: AccountExecutionLeaseHandle | undefined,
    assertExecutionLeaseCurrent: (
        executionLease?: AccountExecutionLeaseHandle
    ) => Promise<void> = assertReLoginExecutionLeaseCurrent
): Promise<void> {
    await assertExecutionLeaseCurrent(executionLease);
    await new Promise(resolve => setTimeout(resolve, LOGIN_RETRY_DELAY_MS));
    await assertExecutionLeaseCurrent(executionLease);
}

type ReLoginFencedSessionInput = Parameters<typeof saveSessionToCacheFenced>[1];

export interface ReLoginRuntime {
    assertExecutionLeaseCurrent: (
        executionLease?: AccountExecutionLeaseHandle
    ) => Promise<void>;
    getCaptchaApiKey: () => Promise<string | null>;
    solveCaptcha: (apiKey: string, captchaImage: string) => Promise<string>;
    trackCredentialLoginFailure: (accountId: string, reason: string | undefined) => Promise<void>;
    trackFreshLoginSuccess: (accountId: string) => Promise<void>;
    saveSessionToCacheFenced: (input: ReLoginFencedSessionInput) => Promise<boolean>;
}

const DEFAULT_RELOGIN_RUNTIME: ReLoginRuntime = {
    assertExecutionLeaseCurrent: assertReLoginExecutionLeaseCurrent,
    getCaptchaApiKey,
    solveCaptcha: async (apiKey, captchaImage) => {
        const captchaSolver = new CaptchaSolver(apiKey);
        return captchaSolver.solve(captchaImage);
    },
    trackCredentialLoginFailure,
    trackFreshLoginSuccess,
    saveSessionToCacheFenced: (input) => saveSessionToCacheFenced(getRedisConnection(), input),
};

export async function performReLogin(
    httpClient: HttpClientService,
    account: OperationBeinAccount,
    route: EffectiveBeinRoute,
    operationName: string,
    executionLease?: AccountExecutionLeaseHandle,
    runtime: ReLoginRuntime = DEFAULT_RELOGIN_RUNTIME
): Promise<boolean> {
    let lastError: string = 'Login failed';

    for (let attempt = 1; attempt <= MAX_LOGIN_RETRIES; attempt++) {
        try {
            await runtime.assertExecutionLeaseCurrent(executionLease);
            console.log(`[HTTP] Re-login route for ${account.username}: ${safeRouteLogSuffix(route)}`);
            console.log(`[HTTP] 🔑 Login attempt ${attempt}/${MAX_LOGIN_RETRIES} for ${account.username} (${operationName})`);

            // Clear cached session on first attempt only
            if (attempt === 1) {
                if (!executionLease) {
                    await deleteSessionFromCache(account.id, route.routeKey);
                }
                httpClient.invalidateSession();
            }

            // Perform fresh login
            await runtime.assertExecutionLeaseCurrent(executionLease);
            const loginResult = await httpClient.login(
                account.username,
                account.password,
                account.totpSecret || undefined
            );
            await runtime.assertExecutionLeaseCurrent(executionLease);

            if (loginResult.requiresCaptcha && loginResult.captchaImage) {
                // Try 2Captcha auto-solve
                console.log(`[HTTP] 🧩 CAPTCHA required during login attempt ${attempt}, attempting auto-solve...`);
                const captchaApiKey = await runtime.getCaptchaApiKey();

                if (captchaApiKey) {
                    try {
                        const solution = await runtime.solveCaptcha(captchaApiKey, loginResult.captchaImage);
                        console.log('[HTTP] ✅ CAPTCHA auto-solved: [REDACTED]');

                        // Submit login with CAPTCHA solution
                        await runtime.assertExecutionLeaseCurrent(executionLease);
                        const loginWithCaptcha = await httpClient.submitLogin(
                            account.username,
                            account.password,
                            account.totpSecret || undefined,
                            solution
                        );
                        await runtime.assertExecutionLeaseCurrent(executionLease);

                        if (!loginWithCaptcha.success) {
                            lastError = loginWithCaptcha.error || 'Login failed after CAPTCHA';
                            await runtime.trackCredentialLoginFailure(account.id, lastError);
                            console.log(`[HTTP] ❌ Attempt ${attempt}/${MAX_LOGIN_RETRIES} failed: ${lastError}`);

                            if (attempt < MAX_LOGIN_RETRIES) {
                                console.log(`[HTTP] ⏳ Retrying in ${LOGIN_RETRY_DELAY_MS}ms...`);
                                await waitForReLoginRetry(executionLease, runtime.assertExecutionLeaseCurrent);
                            }
                            continue; // Try next attempt
                        }

                        console.log(`[HTTP] ✅ Login with CAPTCHA successful on attempt ${attempt}`);
                    } catch (captchaError: unknown) {
                        if (isProviderExecutionLeaseLostError(captchaError)) throw captchaError;
                        lastError = `CAPTCHA auto-solve failed: ${getErrMsg(captchaError)}`;
                        console.log(`[HTTP] ❌ Attempt ${attempt}/${MAX_LOGIN_RETRIES}: ${lastError}`);

                        if (attempt < MAX_LOGIN_RETRIES) {
                            console.log(`[HTTP] ⏳ Retrying in ${LOGIN_RETRY_DELAY_MS}ms...`);
                            await waitForReLoginRetry(executionLease, runtime.assertExecutionLeaseCurrent);
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
                await runtime.trackCredentialLoginFailure(account.id, lastError);
                console.log(`[HTTP] ❌ Attempt ${attempt}/${MAX_LOGIN_RETRIES} failed: ${lastError}`);

                if (attempt < MAX_LOGIN_RETRIES) {
                    console.log(`[HTTP] ⏳ Retrying in ${LOGIN_RETRY_DELAY_MS}ms...`);
                    await waitForReLoginRetry(executionLease, runtime.assertExecutionLeaseCurrent);
                }
                continue; // Try next attempt
            }

            // === LOGIN SUCCESS ===
            await runtime.trackFreshLoginSuccess(account.id);

            // Save new session to cache
            await runtime.assertExecutionLeaseCurrent(executionLease);
            const newSession = await httpClient.exportSession();
            await runtime.assertExecutionLeaseCurrent(executionLease);
            // FIX: Update timestamps before saving
            const now = Date.now();
            newSession.expiresAt = now + (15 * 60 * 1000);  // 15 min from now
            newSession.loginTimestamp = now;
            const sharedSession = prepareSharedSessionForCache(newSession);
            if (executionLease) {
                await runtime.assertExecutionLeaseCurrent(executionLease);
                const saved = await runtime.saveSessionToCacheFenced({
                    accountId: account.id,
                    routeKey: route.routeKey,
                    session: sharedSession,
                    ttlSeconds: httpClient.getSessionTimeout(),
                    lease: executionLease,
                });
                if (!saved) throw new Error('PROVIDER_EXECUTION_LEASE_LOST_DURING_SESSION_SAVE');
                await runtime.assertExecutionLeaseCurrent(executionLease);
            } else {
                await saveSessionToCache(account.id, route.routeKey, sharedSession, httpClient.getSessionTimeout());
            }
            console.log(`[HTTP] ✅ Fresh login successful for ${operationName} (attempt ${attempt})`);

            return true;

        } catch (error: unknown) {
            if (isProviderExecutionLeaseLostError(error)) throw error;
            lastError = getErrMsg(error);
            console.log(`[HTTP] ❌ Attempt ${attempt}/${MAX_LOGIN_RETRIES} threw: ${lastError}`);

            if (attempt < MAX_LOGIN_RETRIES) {
                console.log(`[HTTP] ⏳ Retrying in ${LOGIN_RETRY_DELAY_MS}ms...`);
                await waitForReLoginRetry(executionLease, runtime.assertExecutionLeaseCurrent);
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
    account: OperationBeinAccount,
    route: EffectiveBeinRoute,
    operation: () => Promise<T>,
    operationName: string,
    executionLease?: AccountExecutionLeaseHandle
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
        await performReLogin(httpClient, account, route, operationName, executionLease);

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

            await performReLogin(httpClient, account, route, operationName, executionLease);

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
    const { operationId, type, cardNumber, promoCode, userId, accountId, smartcardType } = job.data;
    const revision = actionRevision(type, job.data.actionRevision);
    let selectedAccountId: string | null = null;

    console.log(`📥 [HTTP] Processing ${operationId}: ${type}`);

    try {
        switch (type) {
            case 'CHECK_ACCOUNT_BALANCE':
                if (accountId) {
                    try {
                        await handleCheckAccountBalance(operationId, accountId, accountPool);
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
                await handleApplyPromoHttp(operationId, cardNumber, promoCode, accountPool, revision, job.data.promoAction || 'APPLY');
                break;
            case 'CONFIRM_PURCHASE':
                await handleConfirmPurchaseHttp(operationId, accountPool);
                break;
            case 'VERIFY_RENEWAL_FULFILLMENT':
                await handleVerifyRenewalFulfillmentHttp(
                    operationId,
                    accountPool,
                    job.data.verificationAttempt
                );
                break;
            case 'VERIFY_REVIEW_CARD':
                await handleVerifyReviewCardHttp(operationId, accountPool);
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
        if (error instanceof QuoteHoldPersistenceError) {
            // Retain the reservation and surface a failed job for operator recovery.
            // Replaying COMPLETE_PURCHASE would replay provider cart preparation.
            throw new UnrecoverableError(error.message);
        }
        if (error instanceof OperationCancelledError) {
            console.log(`🚫 [HTTP] Operation ${operationId} cancelled`);
            return;
        }

        // Promo preparation never owns financial closure, even when reservation
        // or client setup fails before its local error handler. Retry the same revision.
        if (type === 'APPLY_PROMO') throw error;

        // The wrapped error can only originate from a read-only fulfillment
        // check before its attempt record is committed. Let BullMQ retry it;
        // never route it through generic renewal failure/refund handling.
        if (
            error instanceof RetryableRenewalVerificationError ||
            type === 'VERIFY_RENEWAL_FULFILLMENT' ||
            type === 'VERIFY_REVIEW_CARD'
        ) {
            console.warn(`[HTTP] Retrying read-only fulfillment verification for ${operationId}: ${getErrMsg(error)}`);
            throw error;
        }

        console.error(`❌ [HTTP] Operation ${operationId} failed:`, getErrMsg(error));

        // ALWAYS read from DB - job data amount may be stale (deferred payment)
        const op = await prisma.operation.findUnique({
            where: { id: operationId },
            select: {
                userId: true,
                amount: true,
                beinAccountId: true,
                status: true,
                type: true,
                cardNumber: true,
                responseData: true,
                providerMutationStartedAt: true,
                providerMutationStage: true,
                providerPaymentState: true,
                fulfillmentState: true,
                fulfillmentVerificationOutcome: true,
                purpose: true,
                renewalFlowVersion: true,
                installmentEvidence: { select: { correlationKey: true } },
            }
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
        if (op.purpose === 'INSTALLMENT' || type === 'CONFIRM_INSTALLMENT') {
            await finalizeInstallmentSettlement({ operationId, preMutation: !op.providerMutationStartedAt,
                expectedCorrelationKey: op.installmentEvidence?.correlationKey });
            return;
        }
        const opAmount = op?.amount || 0;
        selectedAccountId = op?.beinAccountId || null;
        const finalPayStarted = op.type === 'RENEW'
            ? Boolean(op.providerMutationStartedAt || op.providerMutationStage) ||
                (op.renewalFlowVersion === 2
                    ? finalProviderMutationMayHaveStarted(op.responseData) ||
                        (op.providerPaymentState !== 'NOT_SUBMITTED' && op.providerPaymentState !== null)
                    : providerMutationMayHaveStarted(op.responseData))
            : hasFinalPaymentStarted(op.status, op.responseData);
        const genericDecision = decideFinalPayRefundSafety({
            success: false,
            message: getErrMsg(error)
        }, finalPayStarted);
        if (op.type === 'RENEW' && finalPayStarted) {
            if (op.renewalFlowVersion === 2) {
                await prisma.operation.updateMany({ where: { id: operationId,
                    status: { notIn: HARD_TERMINAL_STATUS_LIST } }, data: {
                    status: 'REVIEW_REQUIRED', providerPaymentState: 'UNKNOWN',
                    fulfillmentState: 'VERIFYING', finalConfirmExpiry: null,
                    responseMessage: 'Provider response uncertain; awaiting read-only sold report verification.',
                } });
                await scheduleRenewalFulfillmentVerification({ operationId,
                    cardNumber: op.cardNumber, attemptNo: 0,
                    retryDueAt: new Date(Date.now() + 5_000), accountPool });
                return;
            }
            const noChargeFinalization = await finalizeRenewalNoChargeFailure({
                operationId,
                responseData: mergeOperationPhaseData(op.responseData, {
                    operationPhase: 'POST_FINAL_PAY_REVIEW',
                    jobType: type,
                }),
                responseMessage: getErrMsg(error),
                refundReason: getErrMsg(error),
            });
            if (noChargeFinalization.status === 'EVIDENCE_CONFLICT') {
                await prisma.operation.updateMany({
                    where: {
                        id: operationId,
                        status: { notIn: TERMINAL_STATUS_LIST }
                    },
                    data: {
                        status: 'REVIEW_REQUIRED',
                        responseMessage: noChargeFinalization.reason,
                        finalConfirmExpiry: null
                    }
                });
            }
            const auditSnapshot = await buildOperationAuditSnapshot({
                operationId,
                userId: op.userId || opUserId || null,
                beinAccountId: op.beinAccountId || null,
                beinUsername: null,
                beinBalanceBefore: null,
                beinBalanceAfter: null,
                outcomeCategory: genericDecision.outcomeCategory,
                reviewReason: noChargeFinalization.status === 'EVIDENCE_CONFLICT'
                    ? noChargeFinalization.reason
                    : getErrMsg(error),
                reviewSource: 'worker-generic-catch-atomic-renewal-finalizer',
                refundBlocked: noChargeFinalization.status === 'EVIDENCE_CONFLICT'
            });
            await persistOperationAuditSnapshot(operationId, op.responseData, auditSnapshot);
            return;
        }
        if (op.type === 'RENEW') {
            await finalizePreMutationRenewalTermination({
                operationId,
                terminalStatus: 'FAILED',
                allowedStatuses: [op.status],
                responseMessage: getErrMsg(error),
                releaseReason: 'GENERIC_PRE_MUTATION_FAILURE',
                retryCount: 1,
            });
            return;
        }
        if (finalPayStarted && !genericDecision.refundSafe) {
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
            await refundUser(operationId, opUserId, opAmount, getErrMsg(error), {
                allowFinalPayRefund: finalPayStarted && genericDecision.refundSafe
            });
        }
        await markOperationFailed(operationId, { type: 'UNKNOWN', message: getErrMsg(error), recoverable: false }, 1);
        await releaseSafeTerminalReservations(operationId, 'GENERIC_NON_RENEW_TERMINAL_FAILURE');
    } finally {
        if (selectedAccountId) {
            await accountPool.releaseLock(selectedAccountId, operationId).catch((releaseError: unknown) => {
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
    const startOperation = await prisma.operation.findUnique({
        where: { id: operationId }, select: { renewalFlowVersion: true, responseData: true },
    });
    const flowVersion = startOperation?.renewalFlowVersion || 1;
    const closurePolicy = quoteData(startOperation?.responseData).prePaymentClosurePolicyVersion;

    await checkIfCancelled(operationId);

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

    // The displayed quote belongs to this account. Convert the temporary
    // queue lock to a durable operation reservation before any provider page
    // is read, otherwise select-package can reject an already shown quote.
    let startReservation: ReservedProviderExecution | null = null;
    try {
        if (flowVersion === 2) startReservation = await reserveProviderAccountForFulfillment({
            operationId, beinAccountId: selectedAccount.id, accountPool, consumer: 'RENEWAL',
        });
    } catch (error) {
        await accountPool.releaseLock(selectedAccount.id, operationId).catch(() => false);
        throw error;
    }
    if (flowVersion === 2 && !startReservation) {
        await accountPool.releaseLock(selectedAccount.id, operationId).catch(() => false);
        throw new Error('ACCOUNT_PREPARATION_RESERVATION_UNAVAILABLE');
    }
    const startHeartbeat = startReservation ? startExecutionLeaseHeartbeat(accountPool, startReservation.lease) : null;
    try {
    await startHeartbeat?.assertCurrent();
    const route = await resolveOperationRoute(selectedAccount, {
        operationId,
        ignoreSnapshot: true
    });

    if (!await updateOperationIfActive(operationId, {
        beinAccountId: selectedAccount.id,
        responseData: JSON.stringify(responseDataWithRoute({ prePaymentClosurePolicyVersion: closurePolicy }, route))
    }, 'START_RENEWAL account update')) {
        await accountPool.markAccountUsed(selectedAccount.id, operationId);
        return;
    }

    console.log(`🔑 [HTTP] Using account: ${selectedAccount.label || selectedAccount.username}`);

    // Get HTTP client for this account (also reloads config if cache expired)
    const client = await createOperationClient(selectedAccount, route);

    // Step 1: Login (with Redis session caching and login locking)
    await updateProgress(operationId, 'Logging in...');
    let needsFreshLogin = true;

    // Check if we already have a valid session from Redis cache
    if (client.isSessionActive()) {
        // IMPORTANT: Validate session with beIN server before trusting Redis cache
        // The keepalive may have missed this account, or beIN may have expired it early
        console.log(`[HTTP] 🔍 Validating cached session for ${selectedAccount.username} on beIN server...`);
        await startHeartbeat?.assertCurrent();
        const sessionValid = await client.validateSession();
        await startHeartbeat?.assertCurrent();

        if (sessionValid) {
            console.log(`[HTTP] ✅ Session validated on beIN — using cached session for ${selectedAccount.username}`);
            needsFreshLogin = false;
        } else {
            console.log(`[HTTP] ⚠️ Session expired on beIN despite Redis cache — need fresh login`);
            // Delete stale session from Redis so other workers don't use it
            await deleteSessionFromCache(selectedAccount.id, route.routeKey);
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
                const cachedSession = await getSessionFromCache(selectedAccount.id, route.routeKey);
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
        await startHeartbeat?.assertCurrent();
        const loginResult = await client.login(
            selectedAccount.username,
            selectedAccount.password,
            selectedAccount.totpSecret || undefined
        );
        await startHeartbeat?.assertCurrent();

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
                    await accountPool.markAccountUsed(selectedAccount.id, operationId);
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
            await startHeartbeat?.assertCurrent();

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
            await saveSessionToCache(selectedAccount.id, route.routeKey, prepareSharedSessionForCache(sessionData), sessionTimeout);
            console.log(`[HTTP] 💾 Session saved to Redis cache (TTL: ${sessionTimeout} min)`);
        } catch (saveError) {
            console.error(`[HTTP] ⚠️ Failed to save session to cache:`, saveError);
        }

        // Release login lock
        await releaseLoginLock(selectedAccount.id, WORKER_ID);
    }

    // ============================================
    // Run checkCard before loadPackages on the same client.
    // HttpClientService carries mutable WebForms state (ViewState, STB, cookies),
    // so these page flows must not share one client concurrently.
    // ============================================

    updateProgress(operationId, 'Loading card info...');
    let stbNumber: string | undefined;

    // Use cache only to skip card/STB lookup before final Pay.
    // Package prices/options are still loaded fresh from beIN for this operation.
    const cachedPackageData = flowVersion === 2 ? null : await getCachedPackages(cardNumber);
    const cachedStb = flowVersion === 2 ? null : cachedPackageData?.stbNumber || await getCachedSTB(cardNumber);

    let packagesResult: LoadPackagesResult;

    if (cachedStb) {
        // STB is cached — only run loadPackages (skip checkCard entirely)
        console.log('[HTTP] STB cache hit — running loadPackages only');
        client.setSTBNumber(cachedStb);
        stbNumber = cachedStb;

        console.log(`📦 [HTTP] Loading packages... (smartcard: ${smartcardType || 'CISCO'})`);
        packagesResult = await withSessionRetry(
            client,
            selectedAccount,
            route,
            async () => {
                await startHeartbeat?.assertCurrent();
                const loaded = await client.loadPackages(cardNumber, smartcardType || 'CISCO');
                await startHeartbeat?.assertCurrent();
                return loaded;
            },
            'loadPackages', startReservation?.lease
        );
    } else {
        // No STB cache: read the STB first, then build the package ViewState chain.
        console.log(`[HTTP] Running checkCard then loadPackages sequentially...`);
        const startTime = Date.now();

        const checkResult = await withSessionRetry(
            client,
            selectedAccount,
            route,
            async () => {
                await startHeartbeat?.assertCurrent();
                const checked = await client.checkCard(cardNumber);
                await startHeartbeat?.assertCurrent();
                return checked;
            },
            'checkCard', startReservation?.lease
        );

        if (!checkResult.success || !checkResult.stbNumber) {
            if (flowVersion === 2) throw new Error('CARD_STB_UNAVAILABLE');
            console.log('[HTTP] checkCard failed; STB may not be available');
        } else {
            stbNumber = checkResult.stbNumber;
            // Cache STB (fire-and-forget)
            if (stbNumber) {
                cacheSTB(cardNumber, stbNumber).catch(() => { });
            }
        }

        packagesResult = await withSessionRetry(
            client,
            selectedAccount,
            route,
            async () => {
                await startHeartbeat?.assertCurrent();
                const loaded = await client.loadPackages(cardNumber, smartcardType || 'CISCO');
                await startHeartbeat?.assertCurrent();
                return loaded;
            },
            'loadPackages', startReservation?.lease
        );

        console.log(`[HTTP] Card/package preparation completed in ${Date.now() - startTime}ms`);
    }

    console.log('[HTTP] Package columns read:', JSON.stringify({ operationId,
        stage: 'LOAD_PACKAGES', quoteRevision: 0, ...packagesResult.readEvidence,
        success: packagesResult.success, packageCount: packagesResult.packages.length }));
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
    const packages = packagesResult.packages.map((pkg) => ({
        index: pkg.index,
        name: pkg.name,
        price: pkg.price,
        priceText: pkg.priceText,
        priceDecimal: pkg.priceDecimal,
        currency: pkg.currency || 'USD',
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
    if (flowVersion === 2) client.setRenewalQuoteRevision(0);
    const sessionData = await client.exportSession();
    await startHeartbeat?.assertCurrent();
    if (startReservation) {
        const saved = await saveOperationSessionToCacheFenced(getRedisConnection(), {
            operationId, session: sessionData, ttlSeconds: 180, route, lease: startReservation.lease,
        });
        if (!saved) throw new Error('ACCOUNT_PREPARATION_SESSION_SAVE_FAILED');
    } else {
        await saveOperationSessionToCache(operationId, sessionData, 180, route);
    }

    // Update operation with packages and safe user-facing metadata.
    // CRITICAL: Set heartbeatExpiry so cleanup cron knows when to auto-cancel
    const now = new Date();
    const heartbeatExpiry = new Date(now.getTime() + HEARTBEAT_TTL_SECONDS * 1000);

    // All provider/session work above is finished. The next queue consumer may
    // be another worker; publish only after the exact legacy owner is parked.
    if (!startReservation && !await parkAccountLockForHandoff(accountPool.getRedis(), selectedAccount.id,
        accountPool.getWorkerId(), operationId)) {
        throw new Error('ACCOUNT_PREPARATION_HANDOFF_LOST');
    }

    await startHeartbeat?.assertCurrent();
    if (!await updateOperationIfActive(operationId, {
        status: 'AWAITING_PACKAGE',
        beinAccountId: selectedAccount.id,  // Merged here instead of separate update
        stbNumber: finalStbNumber,
        availablePackages: packages,
        captchaImage: null,
        captchaSolution: null,
        captchaExpiry: null,
        finalConfirmExpiry: new Date(now.getTime() + PACKAGE_SELECTION_TIMEOUT_MS),
        // Heartbeat system - allows cleanup cron to auto-cancel stuck operations
        lastHeartbeat: now,
        heartbeatExpiry: heartbeatExpiry,
        // Operation session is stored server-side in Redis.
        responseData: JSON.stringify(responseDataWithRoute({
            dealerBalance: packagesResult.dealerBalance,  // For balance validation
            ...readyPackageQuote({}, packages, 0, null),
            prePaymentClosurePolicyVersion: closurePolicy,
            savedAt: new Date().toISOString(),
            smartcardType: smartcardType || 'CISCO',
            operationPhase: 'PACKAGE_PREPARATION',
            jobType: 'START_RENEWAL',
            finalPaySubmitted: false,
            accountLockOwner: operationId
        }, route))
    }, 'START_RENEWAL package update')) {
        await accountPool.markAccountUsed(selectedAccount.id, operationId);
        return;
    }


    console.log(`✅ [HTTP] Packages loaded for ${operationId}: ${packages.length} packages, Dealer Balance: ${packagesResult.dealerBalance || 'N/A'} USD`);
    } finally {
        startHeartbeat?.stop();
        if (startReservation) {
            await accountPool.releaseExecutionLease(startReservation.lease).catch(() => false);
        }
    }
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
    accountPool: AccountPoolManager,
    revision: number,
    promoAction: PromoAction
): Promise<void> {
    const operation = await prisma.operation.findUnique({ where: { id: operationId } });
    if (!operation || !isCurrentPromo(operation, revision, promoCode, promoAction)) return;
    if (cardNumber !== operation.cardNumber) throw new Error('PROMO_CARD_CONTEXT_CONFLICT');

    // Re-read under the canonical card/operation locks. A late result, cancellation
    // or duplicate job must never replace a newer quote or its financial state.
    const publish = (result: LoadPackagesResult, assertCurrent?: () => Promise<void>) =>
        publishPromoQuote(prisma, { operationId, revision, promoCode, promoAction, result }, assertCurrent);
    const finishFailedPromo = async (result: LoadPackagesResult, assertCurrent?: () => Promise<void>) => {
        if (!await publish(result, assertCurrent)) return;
        if (operation.renewalFlowVersion === 2) {
            const closure = await finalizePreMutationRenewalTermination({
                operationId, terminalStatus: 'FAILED', allowedStatuses: ['AWAITING_PACKAGE'],
                responseMessage: 'PROMO_REFRESH_UNVERIFIED',
                releaseReason: 'PROMO_QUOTE_FAILED_BEFORE_PAYMENT',
            });
            if (closure.status === 'EVIDENCE_CONFLICT') {
                console.warn(`[HTTP] Promo failure closure needs review: ${closure.reason}`);
            }
        }
    };

    if (!operation.beinAccountId) {
        await finishFailedPromo({ success: false, packages: [], error: 'PROMO_REFRESH_UNVERIFIED',
            failureStage: 'PRE_SUBMIT', providerPostSent: false });
        return;
    }
    const reserved = await reserveProviderAccountForFulfillment({
        operationId, beinAccountId: operation.beinAccountId, accountPool, consumer: 'RENEWAL',
    });
    if (!reserved) {
        await finishFailedPromo({ success: false, packages: [], error: 'PROMO_REFRESH_UNVERIFIED',
            failureStage: 'PRE_SUBMIT', providerPostSent: false });
        return;
    }
    const heartbeat = startExecutionLeaseHeartbeat(accountPool, reserved.lease);
    try {
        await heartbeat.assertCurrent();
        const current = await prisma.operation.findUnique({ where: { id: operationId } });
        if (!current || !isCurrentPromo(current, revision, promoCode, promoAction)) return;
        if (current.renewalFlowVersion === 2 &&
            quoteData(current.responseData).promoPostStartedRevision === revision) {
            await finishFailedPromo({ success: false, packages: [], error: 'PROMO_REFRESH_UNVERIFIED',
                failureStage: 'POST_RESPONSE_UNVERIFIED', providerPostSent: true }, heartbeat.assertCurrent);
            return;
        }
        const route = await resolveOperationRoute(reserved.account, {
            operationId, responseData: current.responseData, legacyFallback: true,
        });
        const client = await createOperationClient(reserved.account, route);
        const restored = await restoreOperationSession(operationId, current.responseData, client, route)
            .catch(() => false);
        if (current.renewalFlowVersion === 2 && (!restored || !client.isSessionActive()))
            throw new Error('PROMO_OPERATION_SESSION_EXPIRED');
        if (current.renewalFlowVersion !== 2 && (!client.isSessionActive() || !await client.validateSession())) {
            await performReLogin(client, reserved.account, route, 'promoQuoteRefresh', reserved.lease);
        }
        const context = parseResponseDataObject(current.responseData);
        const result = await refreshPromoPackages(client, {
            cardNumber: current.cardNumber,
            smartcardType: typeof context.smartcardType === 'string' ? context.smartcardType : 'CISCO',
            promoAction, promoCode, reuseCurrentPage: current.renewalFlowVersion === 2,
        }, heartbeat.assertCurrent, current.renewalFlowVersion === 2 ? async () => {
            await heartbeat.assertCurrent();
            await prisma.$transaction(async tx => {
                if (!await lockFinancialOperation(tx, operationId)) throw new Error('PROMO_OPERATION_CHANGED');
                const beforeSubmit = await tx.operation.findUnique({ where: { id: operationId } });
                if (!beforeSubmit || !isCurrentPromo(beforeSubmit, revision, promoCode, promoAction) ||
                    quoteData(beforeSubmit.responseData).promoPostStartedRevision === revision) {
                    throw new Error('PROMO_OPERATION_CHANGED');
                }
                await heartbeat.assertCurrent();
                await tx.operation.update({ where: { id: operationId }, data: {
                    responseData: JSON.stringify({ ...quoteData(beforeSubmit.responseData),
                        promoPostStartedRevision: revision, promoPostStartedAt: new Date().toISOString() }),
                } });
            });
        } : undefined);
        await heartbeat.assertCurrent();
        const quoteReady = result.success && result.packages.length > 0;
        console.log('[HTTP] Package columns read:', JSON.stringify({ operationId,
            stage: promoAction === 'REMOVE' ? 'REMOVE_PROMO' : 'APPLY_PROMO', quoteRevision: revision,
            ...result.readEvidence, success: result.success, packageCount: result.packages.length }));
        if (quoteReady) {
            await heartbeat.assertCurrent();
            if (current.renewalFlowVersion === 2) client.setRenewalQuoteRevision(revision);
            const session = await client.exportSession();
            const saved = await saveOperationSessionToCacheFenced(getRedisConnection(), {
                operationId, session, ttlSeconds: 180, route, lease: reserved.lease,
            });
            if (!saved) throw new Error('PROMO_OPERATION_SESSION_SAVE_FAILED');
        }
        console.log(`[HTTP] Promo ${promoAction} revision ${revision}: ${quoteReady ? 'QUOTE_READY' :
            result.failureStage || 'PRE_SUBMIT'}`);
        if (!quoteReady && result.failureReason) {
            console.warn('[HTTP] Promo quote rejected:', JSON.stringify({
                operationId, revision, action: promoAction, reason: result.failureReason,
                providerPostSent: result.providerPostSent === true,
            }));
        }
        if (quoteReady) await publish(result, heartbeat.assertCurrent);
        else await finishFailedPromo({ ...result, success: false, packages: [],
            error: result.error || 'PROMO_REFRESH_UNVERIFIED' }, heartbeat.assertCurrent);
    } catch (error) {
        console.error(`[HTTP] Promo ${promoAction} quote refresh failed: ${getErrMsg(error)}`);
        const marker = quoteData((await prisma.operation.findUnique({ where: { id: operationId },
            select: { responseData: true } }))?.responseData).promoPostStartedRevision === revision;
        // If this write cannot finish, leave the durable job retryable. The
        // persisted revision marker prevents its retry from posting the promo
        // again; silently acknowledging would strand a pending quote.
        await finishFailedPromo({ success: false, packages: [], error: 'PROMO_REFRESH_UNVERIFIED',
            failureStage: marker ? 'POST_RESPONSE_UNVERIFIED' : 'PRE_SUBMIT', providerPostSent: marker },
        heartbeat.assertCurrent);
    } finally {
        heartbeat.stop();
        await accountPool.releaseExecutionLease(reserved.lease).catch(() => false);
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
            status: true,
            providerMutationStartedAt: true,
            renewalFlowVersion: true,
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

    if (operation.status === OperationStatus.AWAITING_FINAL_CONFIRM) {
        console.log(`[HTTP] COMPLETE_PURCHASE already prepared for ${operationId}; duplicate job skipped`);
        return;
    }
    if (operation.providerMutationStartedAt || providerMutationMayHaveStarted(operation.responseData)) {
        if (operation.renewalFlowVersion === 2 && !operation.providerMutationStartedAt &&
            !finalProviderMutationMayHaveStarted(operation.responseData)) {
            // A replay after Add/Sell must not send either request again. Those
            // requests only prepared the choice; settle the untouched attempt.
            await finalizePreMutationRenewalTermination({
                operationId, terminalStatus: 'FAILED', allowedStatuses: [operation.status],
                responseMessage: 'PACKAGE_SELECTION_UNVERIFIED',
                releaseReason: 'PROVIDER_SELECTION_PRE_FINAL_REPLAY',
            });
            return;
        }
        await prisma.operation.updateMany({
            where: { id: operationId, status: { notIn: HARD_TERMINAL_STATUS_LIST } },
            data: {
                status: OperationStatus.REVIEW_REQUIRED,
                responseMessage: 'Provider sale preparation may already have started. Automatic replay is blocked.',
                finalConfirmExpiry: null,
            },
        });
        return;
    }

    if (!await updateOperationIfActive(operationId, { status: 'COMPLETING', responseMessage: 'Completing purchase...' }, 'COMPLETE_PURCHASE completing update')) return;

    // Track which accounts we've tried
    const triedAccountIds: string[] = [];
    let currentAccountId = operation.beinAccountId;
    let currentResponseData: unknown = operation.responseData;
    let currentReservationGeneration: number | null = null;
    let lastError = '';

    // Retry loop - try all available accounts
    while (true) {
        const attemptNumber = triedAccountIds.length + 1;
        console.log(`[HTTP] 🔄 Attempt ${attemptNumber}: Trying account ${currentAccountId}`);

        const attemptResult = await attemptPurchaseWithAccount(
            operationId,
            {
                ...operation,
                responseData: currentResponseData
            },
            currentAccountId,
            selectedPackage,
            promoCode,
            accountPool,
            triedAccountIds,
            operation.renewalFlowVersion
        );

        if (attemptResult.success) {
            console.log(`[HTTP] Purchase prepared for final confirmation on attempt ${attemptNumber}`);
            return;
        }

        if (attemptResult.quoteConflict) {
            // The owning attempt saved the hold under its lease and the canonical
            // lock. A stale attempt must not overwrite a newer result or prepare again.
            return;
        }

        // Mark this account as tried
        triedAccountIds.push(currentAccountId);
        lastError = attemptResult.error || 'Unknown error';
        currentReservationGeneration = attemptResult.reservationGeneration ?? currentReservationGeneration;

        if (operation.renewalFlowVersion === 2) {
            // No OK/Pay is reachable from COMPLETE_PURCHASE. A failed Add,
            // Sell or STB step cannot be retried, but is not a payment hold.
            await finalizePreMutationRenewalTermination({
                operationId, terminalStatus: 'FAILED', allowedStatuses: ['COMPLETING'],
                responseMessage: lastError,
                releaseReason: 'PROVIDER_SELECTION_PRE_FINAL_FAILURE',
            });
            return;
        }

        if (attemptResult.providerMutationMayHaveStarted) {
            const reviewData = mergeOperationPhaseData(currentResponseData, {
                operationPhase: 'POST_FINAL_PAY_REVIEW',
                jobType: 'COMPLETE_PURCHASE',
                providerPaymentState: 'UNKNOWN',
                fulfillmentState: 'VERIFYING',
                fulfillmentReasonCode: 'PROVIDER_PREPARATION_MUTATION_UNCERTAIN',
            });
            await prisma.operation.updateMany({
                where: { id: operationId, status: { notIn: HARD_TERMINAL_STATUS_LIST } },
                data: {
                    status: OperationStatus.REVIEW_REQUIRED,
                    providerPaymentState: 'UNKNOWN',
                    fulfillmentState: 'VERIFYING',
                    responseMessage: lastError,
                    responseData: reviewData,
                    finalConfirmExpiry: null,
                },
            });
            return;
        }

        // Version 2 is bound to one account and one saved WebForms offer.
        // A fresh login or a different account would create a different quote.
        // Check if we should retry with a different account
        if (!attemptResult.shouldRetryDifferentAccount) {
            console.log(`[HTTP] ❌ Error is not recoverable with different account: ${lastError}`);
            throw new Error(lastError);
        }

        console.log(`[HTTP] ⚠️ Attempt ${attemptNumber} failed: ${lastError}`);
        console.log(`[HTTP] 🔍 Looking for alternative account (tried: ${triedAccountIds.length})...`);

        if (currentReservationGeneration !== null) {
            await supersedeRenewalFulfillmentBaseline(operationId, 'SAFE_PRE_MUTATION_FAILOVER');
            await releaseProviderAccountReservation({
                operationId,
                beinAccountId: currentAccountId,
                reservationGeneration: currentReservationGeneration,
            });
        }
        await deleteOperationSessionFromCache(operationId);
        await invalidatePackageCache(operation.cardNumber);

        // Try to get another account (with minimum balance filter for balance errors)
        const minBalance = attemptResult.isBalanceError ? selectedPackage.price : undefined;
        const nextAccount = await accountPool.getNextAvailableAccountExcluding(
            triedAccountIds,
            minBalance,
            operationId
        );

        if (!nextAccount) {
            console.log(`[HTTP] ❌ No more accounts available after trying ${triedAccountIds.length}`);

            // Final error message
            const finalError = attemptResult.isBalanceError
                ? 'beIN account balance insufficient. No other accounts available with sufficient balance.'
                : `Operation failed after trying ${triedAccountIds.length} accounts. ${lastError}`;

            throw new Error(finalError);
        }

        const nextRoute = resolveRetryAccountRoute(nextAccount, {
            previousResponseData: currentResponseData
        });
        const nextResponseData = prepareRetryAccountResponseData(currentResponseData, nextRoute);

        // Update operation with the new account and its route together.
        if (!await updateOperationIfActive(operationId, {
            beinAccountId: nextAccount.id,
            responseData: JSON.stringify(nextResponseData)
        }, 'COMPLETE_PURCHASE account update')) {
            await accountPool.markAccountUsed(nextAccount.id, operationId);
            return;
        }
        await deleteOperationSessionFromCache(operationId);

        currentAccountId = nextAccount.id;
        currentResponseData = nextResponseData;
        currentReservationGeneration = null;
        // The next attempt captures a fresh baseline, reloads packages, reapplies promo,
        // and calls rematchSelectedPackage before any provider sale mutation.
        console.log(`[HTTP] Retrying with account: ${nextAccount.label || nextAccount.username} (Balance: ${nextAccount.dealerBalance || 'unknown'} USD) ${safeRouteLogSuffix(nextRoute)}`);
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
    selectedPackage: QuotePackage,
    promoCode: string | undefined,
    accountPool: AccountPoolManager,
    triedAccountIds: string[],
    renewalFlowVersion: number
): Promise<{
    success: boolean;
    shouldRetryDifferentAccount: boolean;
    isBalanceError: boolean;
    providerMutationMayHaveStarted: boolean;
    reservationGeneration?: number;
    quoteConflict?: boolean;
    error?: string;
}> {
    let reservedExecution: ReservedProviderExecution | null = null;
    let leaseHeartbeat: ReturnType<typeof startExecutionLeaseHeartbeat> | null = null;
    let saleMutationStarted = false;
    let providerCartStarted = false;
    let selectionFailure: { stage: string; reason: string } | null = null;
    try {
        reservedExecution = await reserveProviderAccountForFulfillment({
            operationId,
            beinAccountId: accountId,
            accountPool,
        });
        if (!reservedExecution) {
            return {
                success: false,
                shouldRetryDifferentAccount: true,
                isBalanceError: false,
                providerMutationMayHaveStarted: false,
                error: 'beIN account is not automation-exclusive or is reserved by another operation'
            };
        }
        leaseHeartbeat = startExecutionLeaseHeartbeat(accountPool, reservedExecution.lease);
        await leaseHeartbeat.assertCurrent();
        const account = reservedExecution.account;

        const savedData = parseResponseDataObject(operation.responseData);
        const route = await resolveOperationRoute(account, {
            operationId,
            responseData: operation.responseData,
            legacyFallback: triedAccountIds.length === 0
        });
        const client = await createOperationClient(account, route);
        if (renewalFlowVersion === 2) {
            const restored = await restoreOperationSession(operationId, operation.responseData, client, route);
            if (!restored || !client.isSessionActive()) throw new Error('PACKAGE_SESSION_EXPIRED');
        } else if (!client.isSessionActive() || !await client.validateSession()) {
            await updateProgress(operationId, 'Logging in...');
            await performReLogin(client, account, route, 'renewalBaselinePreparation', reservedExecution.lease);
        }
        await leaseHeartbeat.assertCurrent();

        const baseline = renewalFlowVersion === 2 ? null : await captureRenewalFulfillmentBaseline({
            operationId,
            beinAccountId: accountId,
            cardNumber: operation.cardNumber,
            reservationGeneration: reservedExecution.reservationGeneration,
            sessionGeneration: reservedExecution.sessionGeneration,
            client,
            assertExecutionCurrent: leaseHeartbeat.assertCurrent,
        });
        if (baseline && (!baseline.complete || !baseline.baselineId)) {
            throw new Error(`FULFILLMENT_BASELINE_INCOMPLETE: ${baseline.reasonCode}`);
        }

        const savedSmartcardType = typeof savedData.smartcardType === 'string'
            ? savedData.smartcardType
            : 'CISCO';
        await leaseHeartbeat.assertCurrent();
        if (renewalFlowVersion === 2) client.assertRenewalSelection(selectedPackage, {
            cardNumber: operation.cardNumber, smartcardType: savedSmartcardType,
        });
        // A cached receiver is only a hint for showing the quote. Re-read the
        // requested card before any cart mutation and refuse a changed pairing.
        const checkedCard = renewalFlowVersion === 2
            ? { success: Boolean(operation.stbNumber), stbNumber: operation.stbNumber || undefined }
            : await client.checkCard(operation.cardNumber);
        await leaseHeartbeat.assertCurrent();
        if (!checkedCard.success || !checkedCard.stbNumber ||
            (operation.stbNumber && checkedCard.stbNumber !== operation.stbNumber)) throw new Error('PACKAGE_QUOTE_CHANGED');
        const packagesResult = renewalFlowVersion === 2 ? null
            : await client.loadPackages(operation.cardNumber, savedSmartcardType);
        if (packagesResult && !packagesResult.success) {
            throw new Error(packagesResult.error || 'Failed to load packages after complete baseline');
        }

        let freshPackages = packagesResult?.packages || [];
        const effectivePromoCode = selectedPackage.appliedPromoCode || null;
        if ((operation.promoCode || null) !== effectivePromoCode ||
            (promoCode !== undefined && (promoCode || null) !== effectivePromoCode)) throw new Error('PACKAGE_QUOTE_CHANGED');
        if (effectivePromoCode && renewalFlowVersion !== 2) {
            saleMutationStarted = true;
            await leaseHeartbeat.assertCurrent();
            const promoResult = await client.applyPromoCode(effectivePromoCode, operation.cardNumber, savedSmartcardType);
            if (!promoResult.success) throw new Error(promoResult.error || 'Promo reapply failed');
            freshPackages = promoResult.packages;
        }
        const rematchedPackage = renewalFlowVersion === 2 ? selectedPackage
            : rematchSelectedPackage(freshPackages, selectedPackage);
        const dealerBalance = renewalFlowVersion === 2
            ? toNullableNumber(savedData.dealerBalance) ?? undefined
            : packagesResult?.dealerBalance;

        if (dealerBalance !== undefined) {
            await prisma.beinAccount.update({
                where: { id: accountId },
                data: { dealerBalance, balanceUpdatedAt: new Date() }
            });
            await checkAndNotifyLowBalance(accountId, account.label || account.username, dealerBalance);
        }

        // ========== DEALER BALANCE CHECK ==========
        if (dealerBalance !== undefined && dealerBalance < rematchedPackage.price) {
            console.log(`[HTTP] ❌ INSUFFICIENT DEALER BALANCE: ${dealerBalance} USD < ${rematchedPackage.price} USD`);

            // Record failure; account cooldowns are disabled.
            await accountPool.markAccountFailed(
                accountId,
                `INSUFFICIENT_BALANCE: ${dealerBalance} < ${rematchedPackage.price}`,
                operationId
            );

            // Notify admins
            await notifyAdminLowBalance(
                accountId,
                account.label || account.username,
                dealerBalance,
                rematchedPackage.price
            );


            return {
                success: false,
                shouldRetryDifferentAccount: true,
                isBalanceError: true,
                providerMutationMayHaveStarted: saleMutationStarted,
                reservationGeneration: reservedExecution.reservationGeneration,
                error: `Insufficient balance: ${dealerBalance} < ${rematchedPackage.price}`
            };
        }

        await leaseHeartbeat.assertCurrent();
        saleMutationStarted = true;
        providerCartStarted = true;
        const preparationStartedAt = new Date().toISOString();
        const preparationData = responseDataWithRoute({
            ...savedData,
            operationPhase: 'PROVIDER_SALE_PREPARATION_STARTED',
            jobType: 'COMPLETE_PURCHASE',
            providerMutationMayHaveStarted: true,
            providerPreparationMutationStartedAt: preparationStartedAt,
            fulfillmentBaselineId: baseline?.baselineId || null,
            fulfillmentSessionGeneration: reservedExecution.sessionGeneration,
            savedAt: preparationStartedAt,
        }, route);
        const preparationPersisted = await prisma.operation.updateMany({
            where: {
                id: operationId,
                status: OperationStatus.COMPLETING,
                providerMutationStartedAt: null,
            },
            data: {
                responseData: preparationData,
            },
        });
        if (preparationPersisted.count !== 1) {
            throw new Error('PROVIDER_PREPARATION_MARKER_CONFLICT');
        }

        console.log(`[HTTP] 📦 Completing purchase: ${rematchedPackage.name} @ ${rematchedPackage.price} USD`);
        const result = await client.completePurchase(
            selectedPackage,
            undefined,
            checkedCard.stbNumber,
            true, // skipFinalClick - pause for confirmation
            leaseHeartbeat.assertCurrent,
            renewalFlowVersion === 2,
            renewalFlowVersion === 2 ? { cardNumber: operation.cardNumber,
                smartcardType: savedSmartcardType } : undefined
        );
        await leaseHeartbeat.assertCurrent();

        if (result.awaitingConfirm) {
            console.log(`⏸️ [HTTP] Awaiting confirmation for ${operationId}`);

            // Export and save updated session for CONFIRM_PURCHASE
            const updatedSessionData = await client.exportSession();
            const operationSessionSaved = await saveOperationSessionToCacheFenced(
                getRedisConnection(),
                {
                    operationId,
                    session: updatedSessionData,
                    ttlSeconds: 90,
                    route,
                    lease: reservedExecution.lease,
                }
            );
            if (!operationSessionSaved) {
                throw new Error('PROVIDER_EXECUTION_LEASE_LOST_DURING_OPERATION_SESSION_SAVE');
            }
            await leaseHeartbeat.assertCurrent();

            // Set heartbeat expiry
            const now = new Date();
            const heartbeatExpiry = new Date(now.getTime() + HEARTBEAT_TTL_SECONDS * 1000);

            if (!await updateOperationIfActive(operationId, {
                status: 'AWAITING_FINAL_CONFIRM',
                finalConfirmExpiry: new Date(now.getTime() + CONFIRMATION_TIMEOUT_MS),
                responseMessage: result.message,
                lastHeartbeat: now,
                heartbeatExpiry: heartbeatExpiry,
                responseData: JSON.stringify(responseDataWithRoute({
                    ...savedData,
                    dealerBalance: dealerBalance,
                    dealerBalanceBefore: dealerBalance,
                    operationPhase: 'FINAL_CONFIRMATION_REQUESTED',
                    jobType: 'COMPLETE_PURCHASE',
                    finalPaySubmitted: false,
                    providerMutationMayHaveStarted: true,
                    fulfillmentBaselineId: baseline?.baselineId || null,
                    fulfillmentSessionGeneration: reservedExecution.sessionGeneration,
                    purchaseIdentity: result.packageEvidence,
                    savedAt: new Date().toISOString()
                }, route))
            }, 'COMPLETE_PURCHASE final confirm update')) {
                return {
                    success: true,
                    shouldRetryDifferentAccount: false,
                    isBalanceError: false,
                    providerMutationMayHaveStarted: true,
                    reservationGeneration: reservedExecution.reservationGeneration,
                };
            }

            if (operation.userId) {
                await createNotification({
                    userId: operation.userId,
                    title: '⚠️ Payment confirmation required',
                    message: `${rematchedPackage.name} - ${rematchedPackage.price} USD`,
                    type: 'warning',
                    link: '/dashboard/operations'
                });
            }

            return {
                success: true,
                shouldRetryDifferentAccount: false,
                isBalanceError: false,
                providerMutationMayHaveStarted: true,
                reservationGeneration: reservedExecution.reservationGeneration,
            };
        }

        // Direct success (shouldn't happen with skipFinalClick=true)
        if (result.success) {
            const directSuccessReviewData = responseDataWithRoute({
                ...parseResponseDataObject(operation.responseData),
                operationPhase: 'POST_FINAL_PAY_REVIEW',
                jobType: 'COMPLETE_PURCHASE',
                finalPaySubmitted: result.finalPaySubmitted === true,
                outcomeCategory: result.outcomeCategory ?? 'UNCERTAIN_REVIEW_REQUIRED',
                expectedCost: rematchedPackage.price,
                reviewSource: 'complete-purchase-direct-success',
                reviewReason: 'Direct success before final confirmation did not include confirmed final Pay evidence.'
            }, route);
            if (!await updateOperationIfActive(operationId, {
                status: 'REVIEW_REQUIRED',
                responseMessage: result.message,
                responseData: directSuccessReviewData
            }, 'COMPLETE_PURCHASE direct success review update')) {
                return {
                    success: true,
                    shouldRetryDifferentAccount: false,
                    isBalanceError: false,
                    providerMutationMayHaveStarted: true,
                    reservationGeneration: reservedExecution.reservationGeneration,
                };
            }
            return {
                success: true,
                shouldRetryDifferentAccount: false,
                isBalanceError: false,
                providerMutationMayHaveStarted: true,
                reservationGeneration: reservedExecution.reservationGeneration,
            };
        }

        // Purchase failed before the customer's final OK/Pay confirmation.
        selectionFailure = result.selectionFailure || null;
        throw new Error(result.message);

    } catch (error: unknown) {
        const errorMessage = getErrMsg(error) || 'Unknown error';
        console.log(`[HTTP] Purchase attempt failed: ${/^[A-Z0-9_]+$/.test(errorMessage) ? errorMessage : 'PROVIDER_REQUEST_FAILED'}`);

        if (errorMessage === 'PACKAGE_QUOTE_CHANGED') {
            if (leaseHeartbeat) {
                for (let saveAttempt = 0; saveAttempt < 3; saveAttempt++) {
                    try {
                        await holdQuoteConflict(prisma, {
                            operationId, revision: quoteRevisionOf(operation.responseData), selectedPackage,
                            ...((renewalFlowVersion === 2 || !providerCartStarted)
                                ? { preSale: { beinAccountId: accountId } } : {}),
                            ...(selectionFailure ? { reasonCode: selectionFailure.reason } : {}),
                        }, leaseHeartbeat.assertCurrent);
                        break;
                    } catch (holdError: unknown) {
                        // A superseded lease cannot publish. A current owner's failed
                        // write is different: retry the write only, never the cart.
                        try { await leaseHeartbeat.assertCurrent(); } catch { break; }
                        if (saveAttempt === 2) throw new QuoteHoldPersistenceError(
                            `PACKAGE_QUOTE_HOLD_PERSISTENCE_FAILED:${operationId}:${getErrMsg(holdError)}`);
                    }
                }
            }
            return { success: false, shouldRetryDifferentAccount: false, isBalanceError: false,
                quoteConflict: true, providerMutationMayHaveStarted: saleMutationStarted, error: errorMessage };
        }

        await accountPool.releaseLock(accountId, operationId).catch((releaseError: unknown) => {
            console.warn(`[HTTP] Failed to release account lock after purchase attempt failure: ${getErrMsg(releaseError)}`);
        });

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
            shouldRetryDifferentAccount: isRecoverableError && !saleMutationStarted,
            isBalanceError: false,
            providerMutationMayHaveStarted: saleMutationStarted,
            ...(reservedExecution
                ? { reservationGeneration: reservedExecution.reservationGeneration }
                : {}),
            error: errorMessage
        };
    } finally {
        leaseHeartbeat?.stop();
        if (reservedExecution) {
            await accountPool.releaseExecutionLease(reservedExecution.lease).catch((releaseError: unknown) => {
                console.warn(`[HTTP] Failed to release fenced execution lease for ${operationId}: ${getErrMsg(releaseError)}`);
            });
        }
    }
}

/**
 * CONFIRM_PURCHASE - Click Ok to finalize
 */
async function handleConfirmPurchaseHttp(
    operationId: string,
    accountPool: AccountPoolManager
): Promise<void> {
    console.log('[HTTP] Confirming purchase for ' + operationId);

    // Legacy FINAL_PAY_REQUEST_STARTED and FINAL_PROVIDER_MUTATION_STARTED both
    // mean verificationOnly: neither barrier permits another provider mutation.
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
            stbNumber: true,
            cardNumber: true,
            finalConfirmExpiry: true,
            responseData: true,
            providerMutationStartedAt: true,
            providerMutationStage: true,
            providerPaymentState: true,
            providerPayRequestedAt: true,
            renewalFlowVersion: true,
        },
    });
    if (!operation || !operation.beinAccountId) {
        throw new Error('Operation or account not found');
    }
    if (isTerminalStatus(operation.status)) {
        console.log('[HTTP] Operation already terminal; skipping CONFIRM_PURCHASE: ' + operationId);
        return;
    }
    if (
        operation.status !== OperationStatus.AWAITING_FINAL_CONFIRM &&
        operation.status !== OperationStatus.COMPLETING &&
        operation.status !== OperationStatus.REVIEW_REQUIRED
    ) {
        throw new Error('Invalid status: ' + operation.status);
    }

    const verificationOnly = Boolean(
        operation.providerMutationStartedAt ||
        operation.providerMutationStage ||
        hasExplicitFinalPaymentStarted(operation.responseData)
    );
    if (verificationOnly) {
        const storedPaymentState = operation.providerPaymentState ||
            getStoredProviderPaymentState(operation.responseData) ||
            'UNKNOWN';
        const retryResponseData = mergeOperationPhaseData(operation.responseData, {
            operationPhase: 'POST_FINAL_PAY_REVIEW',
            jobType: 'CONFIRM_PURCHASE',
            providerPaymentState: storedPaymentState === 'NOT_SUBMITTED' ? 'UNKNOWN' : storedPaymentState,
            fulfillmentState: 'VERIFYING',
            fulfillmentReasonCode: 'FINAL_MUTATION_ALREADY_STARTED_VERIFICATION_ONLY',
        });
        await prisma.operation.updateMany({
            where: { id: operationId, status: { notIn: HARD_TERMINAL_STATUS_LIST } },
            data: {
                status: OperationStatus.REVIEW_REQUIRED,
                providerPaymentState: storedPaymentState === 'NOT_SUBMITTED' ? 'UNKNOWN' : storedPaymentState,
                fulfillmentState: 'VERIFYING',
                responseMessage: 'Provider mutation already started; only fulfillment verification is allowed.',
                responseData: retryResponseData,
                finalConfirmExpiry: null,
            },
        });
        await handleVerifyRenewalFulfillmentHttp(operationId, accountPool);
        return;
    }

    if (
        operation.finalConfirmExpiry &&
        new Date() > operation.finalConfirmExpiry &&
        !hasRenewalFinalPayDispatchEvidence(operation.status, operation.responseData)
    ) {
        await finalizePreMutationRenewalTermination({
            operationId,
            terminalStatus: 'FAILED',
            allowedStatuses: [OperationStatus.AWAITING_FINAL_CONFIRM, OperationStatus.COMPLETING],
            responseMessage: 'Confirmation timeout',
            releaseReason: 'CONFIRMATION_TIMEOUT_PRE_MUTATION',
            retryCount: 1,
        });
        return;
    }

    if (!await updateOperationIfActive(operationId, {
        status: OperationStatus.COMPLETING,
        responseMessage: 'Confirming purchase...',
    }, 'CONFIRM_PURCHASE completing update')) return;

    const reserved = await reserveProviderAccountForFulfillment({
        operationId,
        beinAccountId: operation.beinAccountId,
        accountPool,
    });
    if (!reserved) {
        await persistRenewalFulfillmentState({
            operationId,
            providerPaymentState: 'NOT_SUBMITTED',
            fulfillmentState: 'CHECK_FAILED',
            verificationOutcome: 'CHECK_FAILED',
            status: 'REVIEW_REQUIRED',
            responseData: mergeOperationPhaseData(operation.responseData, {
                operationPhase: 'POST_FINAL_PAY_REVIEW',
                jobType: 'CONFIRM_PURCHASE',
                providerPaymentState: 'NOT_SUBMITTED',
                fulfillmentState: 'CHECK_FAILED',
                verificationOutcome: 'CHECK_FAILED',
                fulfillmentReasonCode: 'CAUSAL_RESERVATION_OR_LEASE_UNAVAILABLE',
            }),
            responseMessage: 'Provider account ownership could not be proven. Manual review required.',
        });
        return;
    }

    const leaseHeartbeat = startExecutionLeaseHeartbeat(accountPool, reserved.lease);
    const account = reserved.account;
    const route = await resolveOperationRoute(account, {
        operationId,
        responseData: operation.responseData,
        legacyFallback: true,
    });
    try {
        await leaseHeartbeat.assertCurrent();
        const client = await createOperationClient(account, route);
        if (operation.stbNumber) client.setSTBNumber(operation.stbNumber);

        const savedData = parseResponseDataObject(operation.responseData);
        const diagnosticBalanceBefore =
            toNullableNumber(savedData.dealerBalanceBefore) ??
            toNullableNumber(savedData.dealerBalance);
        if (typeof savedData.savedAt === 'string') {
            validateSessionAge(savedData.savedAt, 'confirmPurchase');
        }
        const restored = await restoreOperationSession(
            operationId,
            operation.responseData,
            client,
            route
        );
        if (!restored) {
            await persistRenewalFulfillmentState({
                operationId,
                providerPaymentState: 'NOT_SUBMITTED',
                fulfillmentState: 'CHECK_FAILED',
                verificationOutcome: 'CHECK_FAILED',
                status: 'REVIEW_REQUIRED',
                responseData: mergeOperationPhaseData(operation.responseData, {
                    operationPhase: 'POST_FINAL_PAY_REVIEW',
                    jobType: 'CONFIRM_PURCHASE',
                    providerPaymentState: 'NOT_SUBMITTED',
                    fulfillmentState: 'CHECK_FAILED',
                    verificationOutcome: 'CHECK_FAILED',
                    fulfillmentReasonCode: 'PRE_MUTATION_SESSION_RESTORE_FAILED',
                }),
                responseMessage: 'Prepared provider session could not be restored. Manual review required.',
            });
            return;
        }

        const selectedPackage = operation.selectedPackage as QuotePackage | null;
        const expectedProviderAmount = toNullableNumber(selectedPackage?.price) ?? operation.amount;
        let finalPayResponseData: Prisma.InputJsonObject | null = null;
        let finalMutationStartedAt: Date | null = null;
        await leaseHeartbeat.assertCurrent();

        const claimMutationStart = async (stage: 'FINAL_OK'): Promise<void> => {
            await leaseHeartbeat.assertCurrent();
            const reservationActive = await assertActiveProviderAccountReservation(prisma, {
                operationId,
                beinAccountId: operation.beinAccountId!,
                reservationGeneration: reserved.reservationGeneration,
            });
            if (!reservationActive) {
                throw new Error('PROVIDER_CAUSAL_RESERVATION_LOST_BEFORE_FINAL_OK');
            }

            const currentOperation = await prisma.operation.findUnique({
                where: { id: operationId },
                select: {
                    status: true,
                    amount: true,
                    responseData: true,
                    providerMutationStartedAt: true,
                    providerMutationStage: true,
                },
            });
            const dispatchDecision = shouldSubmitRenewalFinalPay(currentOperation);
            if (!dispatchDecision.allowed) {
                throw new Error('Final provider mutation blocked: ' + dispatchDecision.reason);
            }

            const markerResponseData = responseDataWithRoute(
                mergeOperationPhaseData(currentOperation?.responseData, {
                    operationPhase: FINAL_PROVIDER_MUTATION_PHASE,
                    jobType: 'CONFIRM_PURCHASE',
                    finalPaySubmitted: false,
                    finalProviderMutationStartedAt: new Date().toISOString(),
                    providerMutationStage: stage,
                    dealerBalanceBefore: diagnosticBalanceBefore,
                    dealerBalanceBeforeSource: diagnosticBalanceBefore === null
                        ? 'missing'
                        : 'package_load_diagnostic',
                    diagnosticDealerBalanceBefore: diagnosticBalanceBefore,
                    diagnosticDealerBalanceBeforeSource: diagnosticBalanceBefore === null
                        ? 'missing'
                        : 'package_load_diagnostic',
                    providerPaymentState: 'UNKNOWN',
                    fulfillmentState: 'VERIFYING',
                    providerEvidenceContext: {
                        operationId,
                        beinAccountId: operation.beinAccountId,
                        cardNumber: operation.cardNumber,
                        packageName: selectedPackage?.name || null,
                        packagePrice: toNullableNumber(selectedPackage?.price),
                        contextMatched: true,
                    },
                    expectedCost: expectedProviderAmount,
                }),
                route
            );
            const marker = await (operation.renewalFlowVersion === 2
                ? claimSameDayFinalMutation : claimFinalProviderMutationStart)({
                operationId,
                beinAccountId: operation.beinAccountId!,
                cardNumber: operation.cardNumber,
                reservationGeneration: reserved.reservationGeneration,
                responseData: markerResponseData,
            });
            if (!marker.claimed || !marker.startedAt) {
                throw new Error('Final provider mutation blocked: ' + ('reason' in marker ? marker.reason : 'stale_context'));
            }
            finalPayResponseData = markerResponseData;
            finalMutationStartedAt = marker.startedAt;
        };
        let rawResult: PurchaseResult;
        try {
            rawResult = await client.confirmPurchase(
                expectedProviderAmount,
                claimMutationStart,
                leaseHeartbeat.assertCurrent,
                selectedPackage ? { selectedPackage, cardNumber: operation.cardNumber } : undefined,
                operation.renewalFlowVersion === 2 ? async () => {
                    await leaseHeartbeat.assertCurrent();
                    await markSameDayPayRequest(operationId);
                } : undefined,
                operation.renewalFlowVersion === 2
            );
        } catch (error) {
            if (operation.renewalFlowVersion !== 2 || !finalMutationStartedAt) throw error;
            // A lost OK/Pay response is ambiguous; do not replay either mutation.
            rawResult = { success: false, message: 'PROVIDER_RESPONSE_LOST',
                outcomeCategory: 'UNCERTAIN_REVIEW_REQUIRED', finalPaySubmitted: true };
        }

        if (rawResult.message === 'PACKAGE_QUOTE_CHANGED') {
            if (!await holdQuoteConflict(prisma, {
                operationId, revision: quoteRevisionOf(operation.responseData), selectedPackage,
            }, leaseHeartbeat.assertCurrent)) throw new Error('PACKAGE_QUOTE_HOLD_PERSISTENCE_FAILED');
            return;
        }

        if (!finalMutationStartedAt) {
            await persistRenewalFulfillmentState({
                operationId,
                providerPaymentState: 'UNKNOWN',
                fulfillmentState: 'CHECK_FAILED',
                verificationOutcome: 'CHECK_FAILED',
                status: 'REVIEW_REQUIRED',
                responseData: mergeOperationPhaseData(
                    finalPayResponseData ?? operation.responseData,
                    {
                        operationPhase: 'POST_FINAL_PAY_REVIEW',
                        jobType: 'CONFIRM_PURCHASE',
                        providerPaymentState: 'UNKNOWN',
                        fulfillmentState: 'CHECK_FAILED',
                        verificationOutcome: 'CHECK_FAILED',
                        fulfillmentReasonCode: 'FINAL_MUTATION_MARKER_NOT_CONFIRMED',
                    }
                ),
                responseMessage: 'Final provider state is ambiguous. Manual review required.',
            });
            return;
        }

        const finalPayEvidence = buildFinalPayBalanceEvidence({
            operationId,
            beinAccountId: operation.beinAccountId,
            cardNumber: operation.cardNumber,
            packageName: selectedPackage?.name || null,
            packagePrice: toNullableNumber(selectedPackage?.price),
            finalBalanceBefore: toNullableNumber(rawResult.beinBalanceBefore),
            finalBalanceAfter: toNullableNumber(rawResult.beinBalanceAfter),
            finalBalanceBeforeSource: rawResult.beinBalanceBeforeSource,
            finalBalanceAfterSource: rawResult.beinBalanceAfterSource,
            diagnosticBalanceBefore,
        });
        const result: PurchaseResult = {
            ...rawResult,
            beinBalanceBefore: finalPayEvidence.finalBalanceBefore ?? undefined,
            beinBalanceAfter: finalPayEvidence.finalBalanceAfter ?? undefined,
        };
        const outcomeDecision = decideFinalPayRefundSafety(result, true);
        const providerPaymentState = renewalProviderPaymentState(result, true);
        let postPayResponseData = responseDataWithRoute(
            mergeOperationPhaseData(finalPayResponseData, {
                operationPhase: 'POST_FINAL_PAY_REVIEW',
                jobType: 'CONFIRM_PURCHASE',
                finalPaySubmitted: result.finalPaySubmitted === true,
                finalPaySubmittedAt: new Date().toISOString(),
                directOkSuccess: operation.renewalFlowVersion === 2 && result.success === true &&
                    result.finalPaySubmitted !== true && /Contract Created Successfully|Package Added Successfully/i.test(result.message),
                dealerBalanceBefore: finalPayEvidence.finalBalanceBefore,
                dealerBalanceBeforeSource: finalPayEvidence.finalBalanceBeforeSource,
                dealerBalanceAfter: finalPayEvidence.finalBalanceAfter,
                dealerBalanceAfterSource: finalPayEvidence.finalBalanceAfterSource,
                diagnosticDealerBalanceBefore: finalPayEvidence.diagnosticBalanceBefore,
                diagnosticDealerBalanceBeforeSource: finalPayEvidence.diagnosticBalanceBeforeSource,
                providerEvidenceState: shouldRecordConfirmedProviderSpend(finalPayEvidence)
                    ? 'confirmed-final-pay'
                    : 'incomplete-evidence',
                providerPaymentState,
                fulfillmentState: 'VERIFYING',
                providerEvidenceCapturedAt: finalPayEvidence.capturedAt,
                expectedCost: expectedProviderAmount,
                outcomeCategory: outcomeDecision.outcomeCategory,
            }),
            route
        );
        const paymentPersisted = await prisma.operation.updateMany({
            where: { id: operationId, status: { notIn: HARD_TERMINAL_STATUS_LIST } },
            data: {
                status: OperationStatus.COMPLETING,
                providerPaymentState,
                fulfillmentState: 'VERIFYING',
                responseMessage: 'Provider mutation submitted; verifying fulfillment evidence.',
                responseData: postPayResponseData,
                finalConfirmExpiry: null,
            },
        });
        if (paymentPersisted.count !== 1) return;

        if (operation.renewalFlowVersion === 2) {
            if (providerPaymentState === 'CHARGED' && shouldRecordConfirmedProviderSpend(finalPayEvidence)) {
                const ledger = await recordConfirmedBeinSpend({
                    operationId, userId: operation.userId, beinAccountId: operation.beinAccountId,
                    dealerBalanceBefore: finalPayEvidence.finalBalanceBefore,
                    dealerBalanceAfter: finalPayEvidence.finalBalanceAfter,
                    evidenceSource: 'BALANCE_DELTA',
                    balanceBeforeSource: finalPayEvidence.finalBalanceBeforeSource,
                    balanceAfterSource: finalPayEvidence.finalBalanceAfterSource,
                });
                if (ledgerResultBlocksCompletion(ledger)) {
                    await persistRenewalFulfillmentState({ operationId, providerPaymentState,
                        fulfillmentState: 'PROOF_CONFLICT', verificationOutcome: 'PROOF_CONFLICT',
                        status: 'REVIEW_REQUIRED', responseData: postPayResponseData,
                        responseMessage: 'Provider balance evidence conflicts with this operation.' });
                    return;
                }
            }
            await verifySameDayRenewal({ operationId, operation, client, accountPool,
                reservationGeneration: reserved.reservationGeneration, providerPaymentState,
                responseData: postPayResponseData, assertCurrent: leaseHeartbeat.assertCurrent,
                renewReadSession: () => performReLogin(client, account, route,
                    'sameDayReportAfterPay', reserved.lease) });
            return;
        }

        await leaseHeartbeat.assertCurrent();
        const verification = await verifyRenewalFulfillmentWithProvider({
            operationId,
            beinAccountId: operation.beinAccountId,
            cardNumber: operation.cardNumber,
            selectedPackage,
            responseData: postPayResponseData,
            finalMutationStartedAt,
            account,
            route,
            client,
            executionLease: reserved.lease,
            verificationSource: 'POST_FINAL_PAY',
            assertExecutionCurrent: leaseHeartbeat.assertCurrent,
        });
        await leaseHeartbeat.assertCurrent();
        const verificationOutcome = verification.correlation.outcome;
        const fulfillmentState = mapVerificationOutcomeToFulfillmentState({
            outcome: verificationOutcome,
            proofMode: verification.proofMode,
            compositeProofClaimed: false,
        });
        let effectiveVerificationOutcome = verificationOutcome;
        let effectiveFulfillmentState = fulfillmentState;
        postPayResponseData = responseDataWithRoute(
            mergeOperationPhaseData(postPayResponseData, {
                operationPhase: verificationOutcome === 'MATCHED'
                    ? 'FULFILLMENT_CANDIDATE_MATCHED'
                    : 'POST_FINAL_PAY_REVIEW',
                jobType: 'CONFIRM_PURCHASE',
                providerPaymentState,
                fulfillmentState,
                verificationOutcome,
                fulfillmentReasonCode: verification.correlation.reasonCode,
                fulfillmentInvoiceNo: verification.correlation.discoveredInvoiceNo || undefined,
                fulfillmentProofMode: verification.proofMode,
                proofKind: 'SOLD_REPORT_CONTRACT_CORRELATION',
            }),
            route
        );

        let attemptRecord: {
            attemptId: string;
            verificationId: string;
            baselineId: string;
            attemptNo: number;
            retryDueAt: Date | null;
            replayed: boolean;
        };
        if (verification.proofMode === 'REVIEW_ONLY') {
            attemptRecord = await recordFulfillmentVerificationAttempt({
                operationId,
                baselineId: verification.baselineId,
                outcome: verificationOutcome,
                reasonCode: verification.correlation.reasonCode,
                completeScan: verification.completeScan,
                pageCount: verification.pageCount,
                rowCount: verification.rowCount,
                candidateInvoiceNo: verification.correlation.discoveredInvoiceNo,
                reportObservedAt: verification.reportObservedAt,
                contractObservedAt: verification.contractObservedAt,
            });
            const reviewOnlyStatus = OperationStatus.REVIEW_REQUIRED;
            postPayResponseData = mergeOperationPhaseData(postPayResponseData, {
                operationPhase: 'POST_FINAL_PAY_REVIEW',
                jobType: 'CONFIRM_PURCHASE',
                providerPaymentState,
                fulfillmentState,
                verificationOutcome,
                fulfillmentProofMode: 'REVIEW_ONLY',
                nextVerificationAt: attemptRecord.retryDueAt?.toISOString() || null,
            });
            void reviewOnlyStatus;
        } else if (verification.proofMode === 'ENFORCE') {
            attemptRecord = await recordFulfillmentVerificationAttempt({
                operationId,
                baselineId: verification.baselineId,
                outcome: verificationOutcome,
                reasonCode: verification.correlation.reasonCode,
                completeScan: verification.completeScan,
                pageCount: verification.pageCount,
                rowCount: verification.rowCount,
                candidateInvoiceNo: verification.correlation.discoveredInvoiceNo,
                reportObservedAt: verification.reportObservedAt,
                contractObservedAt: verification.contractObservedAt,
            });
            postPayResponseData = mergeOperationPhaseData(postPayResponseData, {
                operationPhase: 'POST_FINAL_PAY_REVIEW',
                jobType: 'CONFIRM_PURCHASE',
                providerPaymentState,
                fulfillmentState,
                verificationOutcome,
                fulfillmentProofMode: 'ENFORCE',
                nextVerificationAt: attemptRecord.retryDueAt?.toISOString() || null,
            });
        } else {
            throw new Error('Unsupported fulfillment proof mode');
        }

        const terminalDecision = decideRenewalTerminalState({
            providerPaymentState,
            fulfillmentState,
            fulfillmentAuthority: 'NONE',
            proofKind: 'SOLD_REPORT_CONTRACT_CORRELATION',
            verificationOutcome,
        });
        let ledgerResult: ConfirmedBeinSpendResult | null = null;
        let ledgerBlocksFinalization = false;

        if (providerPaymentState === 'CHARGED') {
            ledgerResult = shouldRecordConfirmedProviderSpend(finalPayEvidence)
                ? await recordConfirmedBeinSpend({
                    operationId,
                    userId: operation.userId,
                    beinAccountId: operation.beinAccountId,
                    dealerBalanceBefore: finalPayEvidence.finalBalanceBefore,
                    dealerBalanceAfter: finalPayEvidence.finalBalanceAfter,
                    evidenceSource: 'BALANCE_DELTA',
                    balanceBeforeSource: finalPayEvidence.finalBalanceBeforeSource,
                    balanceAfterSource: finalPayEvidence.finalBalanceAfterSource,
                })
                : null;
            ledgerBlocksFinalization = ledgerResultBlocksCompletion(ledgerResult);
            const auditSnapshot = await buildOperationAuditSnapshot({
                operationId,
                userId: operation.userId,
                beinAccountId: operation.beinAccountId,
                beinUsername: account.username,
                beinBalanceBefore: finalPayEvidence.finalBalanceBefore,
                beinBalanceAfter: finalPayEvidence.finalBalanceAfter,
                beinBalanceBeforeSource: finalPayEvidence.finalBalanceBeforeSource,
                beinBalanceAfterSource: finalPayEvidence.finalBalanceAfterSource,
                diagnosticDealerBalanceBefore: finalPayEvidence.diagnosticBalanceBefore,
                diagnosticDealerBalanceBeforeSource: finalPayEvidence.diagnosticBalanceBeforeSource,
                providerEvidenceState: shouldRecordConfirmedProviderSpend(finalPayEvidence)
                    ? 'confirmed-final-pay'
                    : 'incomplete-evidence',
                outcomeCategory: outcomeDecision.outcomeCategory,
                reviewReason: ledgerResultReviewReason(ledgerResult) ||
                    'Provider payment charged while fulfillment awaits unique proof.',
                reviewSource: 'confirm-purchase-composite-fulfillment',
                refundBlocked: true,
                chargedBeinLedgerId: ledgerResultId(ledgerResult),
            });
            postPayResponseData = mergeOperationAuditSnapshot(postPayResponseData, auditSnapshot);
            await prisma.operation.updateMany({
                where: { id: operationId, status: { notIn: HARD_TERMINAL_STATUS_LIST } },
                data: {
                    status: 'REVIEW_REQUIRED',
                    providerPaymentState,
                    fulfillmentState,
                    fulfillmentVerificationOutcome: verificationOutcome,
                    responseMessage: ledgerResultReviewReason(ledgerResult) ||
                        'Provider charged; unique package fulfillment is being verified.',
                    responseData: postPayResponseData,
                    finalConfirmExpiry: null,
                },
            });
            await upsertRenewalFulfillmentSafetyIssue({
                operationId,
                userId: operation.userId,
                beinAccountId: operation.beinAccountId,
                operationAmount: operation.amount,
                issueType: 'PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED',
                details: {
                    source: 'worker_post_final_pay',
                    providerPaymentState,
                    verificationOutcome,
                    reasonCode: verification.correlation.reasonCode,
                },
            });
            if (ledgerResultBlocksCompletion(ledgerResult)) {
                console.warn('[HTTP] Charged renewal ledger conflict; finalization blocked: ' + operationId);
            }
        } else if (terminalDecision.decision === 'REVIEW_REQUIRED') {
            await persistRenewalFulfillmentState({
                operationId,
                providerPaymentState,
                fulfillmentState,
                verificationOutcome,
                status: 'REVIEW_REQUIRED',
                responseData: postPayResponseData,
                responseMessage: 'Provider outcome requires manual fulfillment review.',
            });
        }

        if (
            verification.proofMode === 'ENFORCE' &&
            !ledgerBlocksFinalization &&
            verificationOutcome === 'MATCHED'
        ) {
            await leaseHeartbeat.assertCurrent();
            const finalization = await finalizeRenewalFulfillment({
                operationId,
                providerPaymentState,
                verification,
                verificationAttempt: attemptRecord,
                reservationGeneration: reserved.reservationGeneration,
            });
            if (finalization.status === 'COMPLETED' || finalization.status === 'ALREADY_COMPLETED') {
                if (finalization.shouldFinalizeSideEffects) {
                    await finalizeRenewalSideEffects(operationId, accountPool);
                }
                return;
            }
            if (finalization.status === 'PROOF_CONFLICT') {
                effectiveVerificationOutcome = 'PROOF_CONFLICT';
                effectiveFulfillmentState = 'PROOF_CONFLICT';
                await markFulfillmentVerificationAttemptProofConflict({
                    operationId,
                    attemptNo: attemptRecord.attemptNo,
                    reasonCode: 'DATABASE_PROOF_CLAIM_CONFLICT',
                });
                postPayResponseData = mergeOperationPhaseData(postPayResponseData, {
                    operationPhase: 'POST_FINAL_PAY_REVIEW',
                    jobType: 'CONFIRM_PURCHASE',
                    providerPaymentState,
                    fulfillmentState: effectiveFulfillmentState,
                    verificationOutcome: effectiveVerificationOutcome,
                    fulfillmentReasonCode: 'DATABASE_PROOF_CLAIM_CONFLICT',
                });
                await upsertRenewalFulfillmentSafetyIssue({
                    operationId,
                    userId: operation.userId,
                    beinAccountId: operation.beinAccountId,
                    operationAmount: operation.amount,
                    issueType: 'FULFILLMENT_PROOF_CONFLICT',
                    details: {
                        source: 'worker_post_final_pay',
                        verificationOutcome,
                        invoiceNo: verification.correlation.discoveredInvoiceNo,
                    },
                });
            }
        }

        if (attemptRecord.retryDueAt) {
            await scheduleRenewalFulfillmentVerification({
                operationId,
                cardNumber: operation.cardNumber,
                attemptNo: attemptRecord.attemptNo,
                retryDueAt: attemptRecord.retryDueAt,
                accountPool,
            });
            return;
        }

        if (
            terminalDecision.decision === 'FAIL_AND_REFUND' &&
            providerPaymentState === 'NOT_CHARGED' &&
            effectiveFulfillmentState === 'NOT_FOUND' &&
            effectiveVerificationOutcome === 'VALID_NO_MATCH'
        ) {
            const noChargeFinalization = await finalizeRenewalNoChargeFailure({
                operationId,
                responseData: postPayResponseData,
                responseMessage: 'Provider explicitly rejected payment and no fulfilled package was found.',
                expected: attemptRecord,
                refundReason: 'Provider explicitly rejected payment and fulfillment verification found no sale.',
            });
            if (noChargeFinalization.status === 'EVIDENCE_CONFLICT') {
                await persistRenewalFulfillmentState({
                    operationId,
                    providerPaymentState,
                    fulfillmentState: 'PROOF_CONFLICT',
                    verificationOutcome: 'PROOF_CONFLICT',
                    status: 'REVIEW_REQUIRED',
                    responseData: postPayResponseData,
                    responseMessage: `Atomic no-charge finalization conflict: ${noChargeFinalization.reason}`,
                });
            }
            if (
                noChargeFinalization.status === 'FAILED_AND_REFUNDED' ||
                noChargeFinalization.status === 'ALREADY_FAILED_AND_REFUNDED'
            ) {
                await deleteOperationSessionFromCache(operationId);
            }
            return;
        }

        await persistRenewalFulfillmentState({
            operationId,
            providerPaymentState,
            fulfillmentState: effectiveFulfillmentState,
            verificationOutcome: effectiveVerificationOutcome,
            status: 'REVIEW_REQUIRED',
            responseData: postPayResponseData,
            responseMessage: 'Unique fulfillment proof was not established. Manual review required.',
        });
    } finally {
        leaseHeartbeat.stop();
        await accountPool.releaseExecutionLease(reserved.lease).catch((error: unknown) => {
            console.error('[HTTP] Failed to release confirmation execution lease: ' + getErrMsg(error));
        });
    }
}

async function verifySameDayRenewal(input: {
    operationId: string;
    operation?: { beinAccountId: string | null; cardNumber: string };
    client: HttpClientService;
    accountPool: AccountPoolManager;
    reservationGeneration: number;
    providerPaymentState: ProviderPaymentState;
    responseData: unknown;
    assertCurrent: () => Promise<void>;
    renewReadSession: () => Promise<boolean>;
    requestedAttemptNo?: number;
}): Promise<void> {
    const current = await prisma.operation.findUnique({ where: { id: input.operationId }, select: {
        id: true, status: true, renewalFlowVersion: true, beinAccountId: true,
        cardNumber: true, selectedPackage: true, responseData: true,
        providerMutationStartedAt: true, providerPayRequestedAt: true,
    } });
    if (!current || current.renewalFlowVersion !== 2 || !current.beinAccountId ||
        isTerminalStatus(current.status)) return;
    const selected = current.selectedPackage as QuotePackage | null;
    const context = parseResponseDataObject(input.responseData);
    const smartcardType = typeof context.smartcardType === 'string' ? context.smartcardType.toUpperCase() : 'CISCO';
    const submittedAt = current.providerPayRequestedAt ||
        (context.directOkSuccess === true ? current.providerMutationStartedAt : null);
    if (!selected || !submittedAt) {
        await persistRenewalFulfillmentState({ operationId: current.id,
            providerPaymentState: input.providerPaymentState, fulfillmentState: 'PROOF_CONFLICT',
            verificationOutcome: 'PROOF_CONFLICT', status: 'REVIEW_REQUIRED',
            responseData: mergeOperationPhaseData(input.responseData, {
                operationPhase: 'POST_FINAL_PAY_REVIEW', jobType: 'VERIFY_RENEWAL_FULFILLMENT',
                fulfillmentReasonCode: 'MISSING_PAY_DATE_OR_DIRECT_OK_SUCCESS',
            }), responseMessage: 'Provider mutation could not be tied to a report day. Manual review required.' });
        return;
    }
    const reportDate = cairoReportDay(submittedAt);
    const config = await getRenewalFulfillmentConfig();
    let report: Awaited<ReturnType<HttpClientService['scanSoldPackagesReport']>>;
    try {
        await input.assertCurrent();
        report = await input.client.scanSoldPackagesReport({
            pageCap: config.reportPageCap, scanAttempts: config.reportScanAttempts,
            dateRange: { from: reportDate, to: reportDate },
        });
        await input.assertCurrent();
        if (report.reasonCode === 'LOGIN_REQUIRED') {
            const loggedIn = await input.renewReadSession();
            if (loggedIn) {
                await input.assertCurrent();
                report = await input.client.scanSoldPackagesReport({
                    pageCap: config.reportPageCap, scanAttempts: config.reportScanAttempts,
                    dateRange: { from: reportDate, to: reportDate },
                });
                await input.assertCurrent();
            }
        }
    } catch {
        await input.assertCurrent();
        report = { outcome: 'CHECK_FAILED', reasonCode: 'SOLD_REPORT_READ_FAILED',
            dealerContextHash: null, rows: [], pageCount: 0,
            pageCap: config.reportPageCap, scanAttemptCount: 0, firstPageWatermark: null };
    }
    const observedAt = new Date();
    const invoices = report.rows.map(row => row.invoiceNo.trim()).filter(Boolean);
    const claims = invoices.length ? await prisma.providerInvoiceClaim.findMany({
        where: { beinAccountId: current.beinAccountId, invoiceNo: { in: invoices } },
        select: { invoiceNo: true, operationId: true },
    }) : [];
    let match = correlateSameDayReport({ report, cardNumber: current.cardNumber,
        smartcardType, selectedPackage: selected,
        claimedInvoices: new Map(claims.map(claim => [claim.invoiceNo, claim.operationId])),
        operationId: current.id });
    if (match.outcome === 'MATCHED' && input.providerPaymentState === 'NOT_CHARGED') {
        match = { outcome: 'PROOF_CONFLICT', reasonCode: 'PROVIDER_REJECTION_REPORT_CONFLICT',
            row: null, candidateCount: match.candidateCount, diagnostics: match.diagnostics };
    }
    console.log('[HTTP] Same-day report match:', JSON.stringify({ operationId: current.id,
        stage: 'SOLD_REPORT', quoteRevision: quoteData(current.responseData).quoteRevision,
        outcome: match.outcome, reasonCode: match.reasonCode, candidateCount: match.candidateCount,
        ...match.diagnostics }));
    const attempt = await recordSameDayAttempt({ operationId: current.id,
        outcome: match.outcome, reasonCode: match.reasonCode, report,
        candidateCount: match.candidateCount, candidateInvoiceNo: match.row?.invoiceNo || null,
        observedAt, requestedAttemptNo: input.requestedAttemptNo });
    const responseData = mergeOperationPhaseData(input.responseData, {
        operationPhase: 'POST_FINAL_PAY_REVIEW', jobType: 'VERIFY_RENEWAL_FULFILLMENT',
        providerPaymentState: input.providerPaymentState, fulfillmentState: 'VERIFYING',
        verificationOutcome: match.outcome, fulfillmentReasonCode: match.reasonCode,
        fulfillmentInvoiceNo: match.row?.invoiceNo || undefined, proofKind: 'SOLD_REPORT_SAME_DAY',
        reportDate, nextVerificationAt: attempt.retryDueAt?.toISOString() || null,
    });
    await prisma.operation.updateMany({ where: { id: current.id,
        status: { in: ['COMPLETING', 'REVIEW_REQUIRED'] } }, data: {
        status: 'REVIEW_REQUIRED', providerPaymentState: input.providerPaymentState,
        fulfillmentState: match.outcome === 'PROOF_CONFLICT' ? 'PROOF_CONFLICT' : 'VERIFYING',
        fulfillmentVerificationOutcome: match.outcome, responseData,
        responseMessage: 'Waiting for beIN sold report verification.', finalConfirmExpiry: null,
    } });
    if (match.outcome === 'MATCHED' && match.row && report.dealerContextHash) {
        await input.assertCurrent();
        const result = await finalizeSameDayReport({ operationId: current.id,
            beinAccountId: current.beinAccountId, reservationGeneration: input.reservationGeneration,
            providerPaymentState: input.providerPaymentState, reportDate, submittedAt,
            observedAt, dealerContextHash: report.dealerContextHash,
            row: match.row, attemptId: attempt.attemptId, attemptNo: attempt.attemptNo });
        if (result === 'COMPLETED' || result === 'ALREADY_COMPLETED') {
            if (result === 'COMPLETED') await finalizeRenewalSideEffects(current.id, input.accountPool);
            return;
        }
        await prisma.$transaction(async tx => {
            await tx.operationFulfillmentVerificationAttempt.update({
                where: { id: attempt.attemptId }, data: {
                    outcome: 'PROOF_CONFLICT', reasonCode: 'DATABASE_PROOF_CLAIM_CONFLICT',
                },
            });
            await tx.operationFulfillmentVerification.update({
                where: { operationId: current.id }, data: {
                    state: 'CONFLICT', lastOutcome: 'PROOF_CONFLICT',
                    lastReasonCode: 'DATABASE_PROOF_CLAIM_CONFLICT', nextCheckAt: null,
                    terminalAt: new Date(),
                },
            });
        });
        await persistRenewalFulfillmentState({ operationId: current.id,
            providerPaymentState: input.providerPaymentState, fulfillmentState: 'PROOF_CONFLICT',
            verificationOutcome: 'PROOF_CONFLICT', status: 'REVIEW_REQUIRED', responseData,
            responseMessage: 'Invoice claim or finalization conflicted; manual review required.' });
        return;
    }
    if (attempt.retryDueAt) await scheduleRenewalFulfillmentVerification({
        operationId: current.id, cardNumber: current.cardNumber,
        attemptNo: attempt.attemptNo, retryDueAt: attempt.retryDueAt, accountPool: input.accountPool,
    });
}

async function handleVerifyRenewalFulfillmentHttp(
    operationId: string,
    accountPool: AccountPoolManager,
    requestedAttemptNo?: number
): Promise<void> {
    const operation = await prisma.operation.findUnique({
        where: { id: operationId },
        select: {
            id: true,
            userId: true,
            beinAccountId: true,
            cardNumber: true,
            amount: true,
            selectedPackage: true,
            responseData: true,
            status: true,
            providerMutationStartedAt: true,
            providerPaymentState: true,
            renewalFlowVersion: true,
            chargedBeinSpendLedger: { select: { beinAccountId: true } },
        },
    });
    if (
        !operation?.beinAccountId ||
        HARD_TERMINAL_STATUS_LIST.includes(operation.status)
    ) return;
    if (
        operation.status !== OperationStatus.COMPLETING &&
        operation.status !== OperationStatus.REVIEW_REQUIRED
    ) return;

    if (operation.renewalFlowVersion === 2) {
        const reserved = await reserveProviderAccountForFulfillment({ operationId,
            beinAccountId: operation.beinAccountId, accountPool });
        if (!reserved) throw new RetryableRenewalVerificationError(
            new Error('PROVIDER_ACCOUNT_EXECUTION_UNAVAILABLE'));
        const heartbeat = startExecutionLeaseHeartbeat(accountPool, reserved.lease);
        try {
            await heartbeat.assertCurrent();
            const route = await resolveOperationRoute(reserved.account, {
                operationId, responseData: operation.responseData, legacyFallback: true });
            const client = await createOperationClient(reserved.account, route);
            const restored = await restoreOperationSession(operationId, operation.responseData, client, route)
                .catch(() => false);
            if (!restored || !client.isSessionActive()) {
                const loggedIn = await performReLogin(client, reserved.account, route,
                    'sameDayReportReadOnlyRetry', reserved.lease);
                if (!loggedIn) throw new Error('FULFILLMENT_READ_SESSION_UNAVAILABLE');
            }
            await verifySameDayRenewal({ operationId, client, accountPool,
                reservationGeneration: reserved.reservationGeneration,
                providerPaymentState: operation.providerPaymentState || 'UNKNOWN',
                responseData: operation.responseData, assertCurrent: heartbeat.assertCurrent,
                requestedAttemptNo,
                renewReadSession: () => performReLogin(client, reserved.account, route,
                    'sameDayReportReadOnlyRetry', reserved.lease) });
        } finally {
            heartbeat.stop();
            await accountPool.releaseExecutionLease(reserved.lease).catch(() => undefined);
        }
        return;
    }

    const activeBaseline = await getActiveRenewalFulfillmentBaseline(operationId);
    if (!activeBaseline || activeBaseline.activeBaseline.supersededAt !== null) {
        await persistRenewalFulfillmentState({
            operationId,
            providerPaymentState: operation.providerPaymentState || 'UNKNOWN',
            fulfillmentState: 'CHECK_FAILED',
            verificationOutcome: 'INCOMPLETE_SCAN',
            status: 'REVIEW_REQUIRED',
            responseData: mergeOperationPhaseData(operation.responseData, {
                operationPhase: 'POST_FINAL_PAY_REVIEW',
                jobType: 'VERIFY_RENEWAL_FULFILLMENT',
                providerPaymentState: operation.providerPaymentState || 'UNKNOWN',
                fulfillmentState: 'CHECK_FAILED',
                verificationOutcome: 'INCOMPLETE_SCAN',
                fulfillmentReasonCode: 'MISSING_NON_SUPERSEDED_BASELINE',
            }),
            responseMessage: 'The causal fulfillment baseline is unavailable. Manual review required.',
        });
        return;
    }
    if (requestedAttemptNo !== undefined) {
        const expectedAttemptNo = activeBaseline.verification.attemptCount + 1;
        if (requestedAttemptNo !== expectedAttemptNo) return;
    }

    const reserved = await reserveProviderAccountForFulfillment({
        operationId,
        beinAccountId: operation.beinAccountId,
        accountPool,
    });
    if (!reserved) {
        throw new RetryableRenewalVerificationError(
            new Error('PROVIDER_ACCOUNT_EXECUTION_UNAVAILABLE')
        );
    }
    const heartbeat = startExecutionLeaseHeartbeat(accountPool, reserved.lease);
    let attemptRecorded = false;
    try {
        await heartbeat.assertCurrent();
        const route = await resolveOperationRoute(reserved.account, {
            operationId,
            responseData: operation.responseData,
            legacyFallback: true,
        });
        const client = await createOperationClient(reserved.account, route);
        const restored = await restoreOperationSession(
            operationId,
            operation.responseData,
            client,
            route
        );
        if (!restored || !client.isSessionActive() || !await client.validateSession()) {
            const loggedIn = await performReLogin(
                client,
                reserved.account,
                route,
                'renewalFulfillmentReadOnlyRetry',
                reserved.lease
            );
            if (!loggedIn) throw new Error('FULFILLMENT_READ_SESSION_UNAVAILABLE');
        }
        await heartbeat.assertCurrent();

        const providerPaymentState = operation.providerPaymentState ||
            getStoredProviderPaymentState(operation.responseData) ||
            'UNKNOWN';
        const verification = await verifyRenewalFulfillmentWithProvider({
            operationId,
            beinAccountId: operation.beinAccountId,
            cardNumber: operation.cardNumber,
            selectedPackage: operation.selectedPackage as { name?: string; price?: number } | null,
            responseData: operation.responseData,
            finalMutationStartedAt: storedFinalMutationStartedAt(operation),
            account: reserved.account,
            route,
            client,
            executionLease: reserved.lease,
            verificationSource: 'WORKER_RETRY',
            assertExecutionCurrent: heartbeat.assertCurrent,
        });
        await heartbeat.assertCurrent();
        const verificationOutcome = verification.correlation.outcome;
        const attempt = await recordFulfillmentVerificationAttempt({
            operationId,
            baselineId: verification.baselineId,
            outcome: verificationOutcome,
            reasonCode: verification.correlation.reasonCode,
            completeScan: verification.completeScan,
            pageCount: verification.pageCount,
            rowCount: verification.rowCount,
            candidateInvoiceNo: verification.correlation.discoveredInvoiceNo,
            reportObservedAt: verification.reportObservedAt,
            contractObservedAt: verification.contractObservedAt,
            requestedAttemptNo,
        });
        attemptRecorded = true;
        const fulfillmentState = mapVerificationOutcomeToFulfillmentState({
            outcome: verificationOutcome,
            proofMode: verification.proofMode,
            compositeProofClaimed: false,
        });
        let effectiveVerificationOutcome = verificationOutcome;
        let effectiveFulfillmentState = fulfillmentState;
        let responseData = mergeOperationPhaseData(operation.responseData, {
            operationPhase: 'POST_FINAL_PAY_REVIEW',
            jobType: 'VERIFY_RENEWAL_FULFILLMENT',
            providerPaymentState,
            fulfillmentState,
            verificationOutcome,
            fulfillmentReasonCode: verification.correlation.reasonCode,
            fulfillmentInvoiceNo: verification.correlation.discoveredInvoiceNo || undefined,
            fulfillmentProofMode: verification.proofMode,
            proofKind: 'SOLD_REPORT_CONTRACT_CORRELATION',
            nextVerificationAt: attempt.retryDueAt?.toISOString() || null,
        });

        const ledgerAccountMismatch = spendLedgerAccountMismatch(operation);
        if (ledgerAccountMismatch) {
            effectiveVerificationOutcome = 'PROOF_CONFLICT';
            effectiveFulfillmentState = 'PROOF_CONFLICT';
            await markFulfillmentVerificationAttemptProofConflict({
                operationId,
                attemptNo: attempt.attemptNo,
                reasonCode: 'SPEND_LEDGER_ACCOUNT_MISMATCH',
            });
            responseData = mergeOperationPhaseData(responseData, {
                operationPhase: 'POST_FINAL_PAY_REVIEW',
                jobType: 'VERIFY_RENEWAL_FULFILLMENT',
                providerPaymentState,
                fulfillmentState: effectiveFulfillmentState,
                verificationOutcome: effectiveVerificationOutcome,
                fulfillmentReasonCode: 'SPEND_LEDGER_ACCOUNT_MISMATCH',
            });
        } else if (verification.proofMode === 'ENFORCE' && verificationOutcome === 'MATCHED') {
            await heartbeat.assertCurrent();
            const finalization = await finalizeRenewalFulfillment({
                operationId,
                providerPaymentState,
                verification,
                verificationAttempt: attempt,
                reservationGeneration: reserved.reservationGeneration,
            });
            if (finalization.status === 'COMPLETED' || finalization.status === 'ALREADY_COMPLETED') {
                if (finalization.shouldFinalizeSideEffects) {
                    await finalizeRenewalSideEffects(operationId, accountPool);
                }
                return;
            }
            if (finalization.status === 'PROOF_CONFLICT') {
                effectiveVerificationOutcome = 'PROOF_CONFLICT';
                effectiveFulfillmentState = 'PROOF_CONFLICT';
                await markFulfillmentVerificationAttemptProofConflict({
                    operationId,
                    attemptNo: attempt.attemptNo,
                    reasonCode: 'DATABASE_PROOF_CLAIM_CONFLICT',
                });
                responseData = mergeOperationPhaseData(responseData, {
                    operationPhase: 'POST_FINAL_PAY_REVIEW',
                    jobType: 'VERIFY_RENEWAL_FULFILLMENT',
                    providerPaymentState,
                    fulfillmentState: effectiveFulfillmentState,
                    verificationOutcome: effectiveVerificationOutcome,
                    fulfillmentReasonCode: 'DATABASE_PROOF_CLAIM_CONFLICT',
                });
            }
        }

        const terminalDecision = decideRenewalTerminalState({
            providerPaymentState,
            fulfillmentState: effectiveFulfillmentState,
            fulfillmentAuthority: 'NONE',
            proofKind: 'SOLD_REPORT_CONTRACT_CORRELATION',
            verificationOutcome: effectiveVerificationOutcome,
        });
        if (attempt.retryDueAt && effectiveVerificationOutcome !== 'PROOF_CONFLICT') {
            await persistRenewalFulfillmentState({
                operationId,
                providerPaymentState,
                fulfillmentState: effectiveFulfillmentState,
                verificationOutcome: effectiveVerificationOutcome,
                status: 'REVIEW_REQUIRED',
                responseData,
                responseMessage: 'Fulfillment evidence is not visible yet; another read-only check is scheduled.',
            });
            await scheduleRenewalFulfillmentVerification({
                operationId,
                cardNumber: operation.cardNumber,
                attemptNo: attempt.attemptNo,
                retryDueAt: attempt.retryDueAt,
                accountPool,
            });
            return;
        }

        if (
            terminalDecision.decision === 'FAIL_AND_REFUND' &&
            providerPaymentState === 'NOT_CHARGED' &&
            effectiveFulfillmentState === 'NOT_FOUND' &&
            effectiveVerificationOutcome === 'VALID_NO_MATCH'
        ) {
            const noChargeFinalization = await finalizeRenewalNoChargeFailure({
                operationId,
                responseData,
                responseMessage: 'Provider rejected payment and complete verification found no fulfilled package.',
                expected: attempt,
                refundReason: 'Provider rejected payment and complete verification found no fulfilled package.',
            });
            if (noChargeFinalization.status === 'EVIDENCE_CONFLICT') {
                await persistRenewalFulfillmentState({
                    operationId,
                    providerPaymentState,
                    fulfillmentState: 'PROOF_CONFLICT',
                    verificationOutcome: 'PROOF_CONFLICT',
                    status: 'REVIEW_REQUIRED',
                    responseData,
                    responseMessage: `Atomic no-charge finalization conflict: ${noChargeFinalization.reason}`,
                });
            }
            return;
        }

        await persistRenewalFulfillmentState({
            operationId,
            providerPaymentState,
            fulfillmentState: effectiveFulfillmentState,
            verificationOutcome: effectiveVerificationOutcome,
            status: 'REVIEW_REQUIRED',
            responseData,
            responseMessage: verification.proofMode === 'REVIEW_ONLY'
                ? 'Fulfillment candidate recorded in review-only mode.'
                : 'Unique fulfillment proof was not established. Manual review required.',
        });
        if (ledgerAccountMismatch || effectiveVerificationOutcome === 'PROOF_CONFLICT') {
            await upsertRenewalFulfillmentSafetyIssue({
                operationId,
                userId: operation.userId,
                beinAccountId: operation.beinAccountId,
                operationAmount: operation.amount,
                issueType: 'FULFILLMENT_PROOF_CONFLICT',
                details: {
                    source: 'worker_verification_retry',
                    verificationOutcome: effectiveVerificationOutcome,
                    reasonCode: ledgerAccountMismatch
                        ? 'SPEND_LEDGER_ACCOUNT_MISMATCH'
                        : 'DATABASE_PROOF_CLAIM_CONFLICT',
                },
            });
        }
        if (providerPaymentState === 'CHARGED') {
            await upsertRenewalFulfillmentSafetyIssue({
                operationId,
                userId: operation.userId,
                beinAccountId: operation.beinAccountId,
                operationAmount: operation.amount,
                issueType: 'PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED',
                details: {
                    source: 'worker_verification_retry',
                    verificationOutcome: effectiveVerificationOutcome,
                    reasonCode: verification.correlation.reasonCode,
                },
            });
        }
    } catch (error: unknown) {
        if (!attemptRecorded) {
            if (!isTransientRenewalVerificationError(error)) {
                console.warn('[HTTP] Retrying unclassified read-only fulfillment failure: ' + getErrMsg(error));
            }
            throw new RetryableRenewalVerificationError(error);
        }
        throw error;
    } finally {
        heartbeat.stop();
        await accountPool.releaseExecutionLease(reserved.lease).catch(() => undefined);
    }
}

/**
 * VERIFY_REVIEW_CARD - Live composite fulfillment check for financial review
 */
async function handleVerifyReviewCardHttp(
    operationId: string,
    accountPool: AccountPoolManager
): Promise<void> {
    const operation = await prisma.operation.findUnique({
        where: { id: operationId },
        select: {
            id: true,
            userId: true,
            beinAccountId: true,
            cardNumber: true,
            amount: true,
            selectedPackage: true,
            responseData: true,
            status: true,
            providerMutationStartedAt: true,
            providerPaymentState: true,
            renewalFlowVersion: true,
            chargedBeinSpendLedger: { select: { beinAccountId: true } },
        },
    });
    if (
        !operation?.beinAccountId ||
        operation.status !== OperationStatus.REVIEW_REQUIRED ||
        !hasReviewFinalPaymentEvidence(operation.responseData)
    ) return;

    // Version 2 has no pre-sale baseline or contract requirement. Its scheduled
    // read-only attempts are handled by VERIFY_RENEWAL_FULFILLMENT; terminal
    // ambiguity stays for a human rather than running legacy correlation.
    if (operation.renewalFlowVersion === 2) return;

    // Admin live verification still requires the active non-superseded causal baseline.
    const activeBaseline = await getActiveRenewalFulfillmentBaseline(operationId);
    if (
        !activeBaseline ||
        activeBaseline.activeBaseline.supersededAt !== null ||
        activeBaseline.activeBaseline.beinAccountId !== operation.beinAccountId
    ) {
        await persistRenewalFulfillmentState({
            operationId,
            providerPaymentState: operation.providerPaymentState || 'UNKNOWN',
            fulfillmentState: 'CHECK_FAILED',
            verificationOutcome: 'INCOMPLETE_SCAN',
            status: 'REVIEW_REQUIRED',
            responseData: mergeOperationPhaseData(operation.responseData, {
                operationPhase: 'POST_FINAL_PAY_REVIEW',
                jobType: 'VERIFY_REVIEW_CARD',
                providerPaymentState: operation.providerPaymentState || 'UNKNOWN',
                fulfillmentState: 'CHECK_FAILED',
                verificationOutcome: 'INCOMPLETE_SCAN',
                fulfillmentReasonCode: 'MISSING_NON_SUPERSEDED_BASELINE',
            }),
            responseMessage: 'A valid causal baseline is unavailable; live verification cannot complete the operation.',
        });
        return;
    }

    const reserved = await reserveProviderAccountForFulfillment({
        operationId,
        beinAccountId: operation.beinAccountId,
        accountPool,
    });
    if (!reserved) throw new Error('PROVIDER_ACCOUNT_EXECUTION_UNAVAILABLE');
    const heartbeat = startExecutionLeaseHeartbeat(accountPool, reserved.lease);
    try {
        await heartbeat.assertCurrent();
        const route = await resolveOperationRoute(reserved.account, {
            operationId,
            responseData: operation.responseData,
            legacyFallback: true,
        });
        const client = await createOperationClient(reserved.account, route);
        const restored = await restoreOperationSession(
            operationId,
            operation.responseData,
            client,
            route
        );
        if (!restored || !client.isSessionActive() || !await client.validateSession()) {
            const loggedIn = await performReLogin(
                client,
                reserved.account,
                route,
                'adminCompositeFulfillmentRead',
                reserved.lease
            );
            if (!loggedIn) throw new Error('ADMIN_FULFILLMENT_READ_SESSION_UNAVAILABLE');
        }
        await heartbeat.assertCurrent();

        const providerPaymentState = operation.providerPaymentState ||
            getStoredProviderPaymentState(operation.responseData) ||
            'UNKNOWN';
        const verification = await verifyRenewalFulfillmentWithProvider({
            operationId,
            beinAccountId: operation.beinAccountId,
            cardNumber: operation.cardNumber,
            selectedPackage: operation.selectedPackage as { name?: string; price?: number } | null,
            responseData: operation.responseData,
            finalMutationStartedAt: storedFinalMutationStartedAt(operation),
            account: reserved.account,
            route,
            client,
            executionLease: reserved.lease,
            verificationSource: 'ADMIN_LIVE_CHECK',
            assertExecutionCurrent: heartbeat.assertCurrent,
        });
        await heartbeat.assertCurrent();
        const verificationOutcome = verification.correlation.outcome;
        const fulfillmentProofMode = verification.proofMode;
        const attempt = await recordFulfillmentVerificationAttempt({
            operationId,
            baselineId: verification.baselineId,
            outcome: verificationOutcome,
            reasonCode: verification.correlation.reasonCode,
            completeScan: verification.completeScan,
            pageCount: verification.pageCount,
            rowCount: verification.rowCount,
            candidateInvoiceNo: verification.correlation.discoveredInvoiceNo,
            reportObservedAt: verification.reportObservedAt,
            contractObservedAt: verification.contractObservedAt,
        });
        const fulfillmentState = mapVerificationOutcomeToFulfillmentState({
            outcome: verificationOutcome,
            proofMode: fulfillmentProofMode,
            compositeProofClaimed: false,
        });
        let effectiveVerificationOutcome = verificationOutcome;
        let effectiveFulfillmentState = fulfillmentState;
        let responseData = mergeOperationPhaseData(operation.responseData, {
            operationPhase: 'POST_FINAL_PAY_REVIEW',
            jobType: 'VERIFY_REVIEW_CARD',
            providerPaymentState,
            fulfillmentState,
            verificationOutcome,
            fulfillmentReasonCode: verification.correlation.reasonCode,
            fulfillmentInvoiceNo: verification.correlation.discoveredInvoiceNo || undefined,
            fulfillmentProofMode,
            proofKind: 'SOLD_REPORT_CONTRACT_CORRELATION',
            nextVerificationAt: attempt.retryDueAt?.toISOString() || null,
        });

        const ledgerAccountMismatch = spendLedgerAccountMismatch(operation);
        if (ledgerAccountMismatch) {
            effectiveVerificationOutcome = 'PROOF_CONFLICT';
            effectiveFulfillmentState = 'PROOF_CONFLICT';
            await markFulfillmentVerificationAttemptProofConflict({
                operationId,
                attemptNo: attempt.attemptNo,
                reasonCode: 'SPEND_LEDGER_ACCOUNT_MISMATCH',
            });
            responseData = mergeOperationPhaseData(responseData, {
                operationPhase: 'POST_FINAL_PAY_REVIEW',
                jobType: 'VERIFY_REVIEW_CARD',
                providerPaymentState,
                fulfillmentState: effectiveFulfillmentState,
                verificationOutcome: effectiveVerificationOutcome,
                fulfillmentReasonCode: 'SPEND_LEDGER_ACCOUNT_MISMATCH',
            });
        } else if (fulfillmentProofMode === 'ENFORCE' && verificationOutcome === 'MATCHED') {
            await heartbeat.assertCurrent();
            const finalization = await finalizeRenewalFulfillment({
                operationId,
                providerPaymentState,
                verification,
                verificationAttempt: attempt,
                reservationGeneration: reserved.reservationGeneration,
            });
            if (finalization.status === 'COMPLETED' || finalization.status === 'ALREADY_COMPLETED') {
                if (finalization.shouldFinalizeSideEffects) {
                    await finalizeRenewalSideEffects(operationId, accountPool);
                }
                return;
            }
            if (finalization.status === 'PROOF_CONFLICT') {
                effectiveVerificationOutcome = 'PROOF_CONFLICT';
                effectiveFulfillmentState = 'PROOF_CONFLICT';
                await markFulfillmentVerificationAttemptProofConflict({
                    operationId,
                    attemptNo: attempt.attemptNo,
                    reasonCode: 'DATABASE_PROOF_CLAIM_CONFLICT',
                });
                responseData = mergeOperationPhaseData(responseData, {
                    operationPhase: 'POST_FINAL_PAY_REVIEW',
                    jobType: 'VERIFY_REVIEW_CARD',
                    providerPaymentState,
                    fulfillmentState: effectiveFulfillmentState,
                    verificationOutcome: effectiveVerificationOutcome,
                    fulfillmentReasonCode: 'DATABASE_PROOF_CLAIM_CONFLICT',
                });
            }
        }

        await persistRenewalFulfillmentState({
            operationId,
            providerPaymentState,
            fulfillmentState: effectiveFulfillmentState,
            verificationOutcome: effectiveVerificationOutcome,
            status: 'REVIEW_REQUIRED',
            responseData,
            responseMessage: fulfillmentProofMode === 'REVIEW_ONLY' && verificationOutcome === 'MATCHED'
                ? 'Composite fulfillment candidate recorded; rollout mode requires manual review.'
                : 'Live composite verification did not establish authoritative fulfillment.',
        });
        if (ledgerAccountMismatch || effectiveVerificationOutcome === 'PROOF_CONFLICT') {
            await upsertRenewalFulfillmentSafetyIssue({
                operationId,
                userId: operation.userId,
                beinAccountId: operation.beinAccountId,
                operationAmount: operation.amount,
                issueType: 'FULFILLMENT_PROOF_CONFLICT',
                details: {
                    source: 'admin_live_verification',
                    verificationOutcome: effectiveVerificationOutcome,
                    reasonCode: ledgerAccountMismatch
                        ? 'SPEND_LEDGER_ACCOUNT_MISMATCH'
                        : 'DATABASE_PROOF_CLAIM_CONFLICT',
                },
            });
        }
    } finally {
        heartbeat.stop();
        await accountPool.releaseExecutionLease(reserved.lease).catch(() => undefined);
    }
}

type SelectedRenewalPackage = QuotePackage;

type ReservedProviderExecution = {
    account: OperationBeinAccount;
    reservationGeneration: number;
    sessionGeneration: string;
    lease: AccountExecutionLeaseHandle;
};

type RenewalVerificationResult = {
    correlation: RenewalFulfillmentCorrelationResult;
    proofMode: FulfillmentProofMode;
    proofCandidate: FulfillmentProofCandidate | null;
    baselineId: string | null;
    completeScan: boolean;
    pageCount: number;
    rowCount: number;
    reportObservedAt: Date | null;
    contractObservedAt: Date | null;
};

function canonicalMoney(value: number): string {
    return value.toFixed(2);
}

function rematchSelectedPackage(
    packages: readonly AvailablePackage[],
    selectedPackage: SelectedRenewalPackage
): AvailablePackage {
    return matchFreshPackage(packages, selectedPackage);
}

function providerMutationMayHaveStarted(responseData: unknown): boolean {
    const phase = getOperationPhase(responseData);
    const data = parseResponseDataObject(responseData);
    return data.providerMutationMayHaveStarted === true ||
        phase === 'PROVIDER_SALE_PREPARATION_STARTED' ||
        phase === 'FINAL_PROVIDER_MUTATION_STARTED' ||
        phase === 'FINAL_PAY_REQUEST_STARTED' ||
        phase === 'FINAL_PAY_SUBMITTED' ||
        phase === 'POST_FINAL_PAY_REVIEW';
}

function finalProviderMutationMayHaveStarted(responseData: unknown): boolean {
    const phase = getOperationPhase(responseData);
    const data = parseResponseDataObject(responseData);
    return data.finalPaySubmitted === true ||
        Boolean(data.finalProviderMutationStartedAt || data.finalPayRequestStartedAt || data.finalPaySubmittedAt) ||
        phase === 'FINAL_PROVIDER_MUTATION_STARTED' ||
        phase === 'FINAL_PAY_REQUEST_STARTED' ||
        phase === 'FINAL_PAY_SUBMITTED' ||
        phase === 'POST_FINAL_PAY_REVIEW';
}

async function reserveProviderAccountForFulfillment(input: {
    operationId: string;
    beinAccountId: string;
    accountPool: AccountPoolManager;
    consumer?: ProviderAccountConsumer;
}): Promise<ReservedProviderExecution | null> {
    const account = await prisma.beinAccount.findUnique({
        where: { id: input.beinAccountId },
        include: { proxy: true },
    });
    if (!account?.isActive || !account.automationExclusive) return null;

    const claim = await prisma.$transaction((tx) =>
        acquireProviderAccountCausalReservation(tx, {
            operationId: input.operationId,
            beinAccountId: input.beinAccountId,
            automaticWindowEndsAt: new Date(Date.now() + 10 * 60_000),
        })
    );
    if (claim.status !== 'ACQUIRED' && claim.status !== 'ALREADY_HELD') return null;

    const compensateNewProviderReservation = async (): Promise<void> => {
        if (claim.status === 'ACQUIRED') {
            await releaseProviderAccountReservation({
                operationId: input.operationId,
                beinAccountId: input.beinAccountId,
                reservationGeneration: claim.reservation.reservationGeneration,
            });
        }
    };
    let lease: AccountExecutionLeaseHandle | null = null;
    let executionReady = false;
    try {
        const legacyLockStatus = await getAccountLockStatus(
            input.accountPool.getRedis(),
            input.beinAccountId
        );
        if (legacyLockStatus.locked) {
            if (
                legacyLockStatus.ownerOperationId !== input.operationId ||
                (legacyLockStatus.ownerWorkerId !== input.accountPool.getWorkerId() && !legacyLockStatus.handoffReady) ||
                !legacyLockStatus.rawOwner
            ) {
                return null;
            }
            lease = await transitionAccountLockToExecutionLease(
                input.accountPool.getRedis(),
                {
                    accountId: input.beinAccountId,
                    operationId: input.operationId,
                    reservationGeneration: claim.reservation.reservationGeneration,
                    leaseId: randomUUID(),
                    workerId: input.accountPool.getWorkerId(),
                    expectedLegacyOwner: legacyLockStatus.rawOwner,
                }
            );
            if (!lease) return null;
        }
        const leaseDeadline = Date.now() + FINAL_CONFIRM_LOCK_WAIT_TIMEOUT_MS;
        while (!lease && Date.now() < leaseDeadline) {
            lease = await acquireAccountExecutionLease(input.accountPool.getRedis(), {
                accountId: input.beinAccountId,
                operationId: input.operationId,
                reservationGeneration: claim.reservation.reservationGeneration,
                leaseId: randomUUID(),
                workerId: input.accountPool.getWorkerId(),
            });
            if (!lease) await delay(250);
        }
        if (!lease) return null;

        const reservationActive = await assertActiveProviderAccountReservation(prisma, {
            operationId: input.operationId,
            beinAccountId: input.beinAccountId,
            reservationGeneration: claim.reservation.reservationGeneration,
        });
        if (!reservationActive) return null;
        const accessDecision = decideProviderAccountConsumerAccess({
            consumer: input.consumer ?? 'RENEWAL',
            activeReservation: {
                operationId: claim.reservation.operationId,
                reservationGeneration: claim.reservation.reservationGeneration,
            },
            requester: {
                operationId: input.operationId,
                reservationGeneration: claim.reservation.reservationGeneration,
                exactExecutionLease: true,
            },
        });
        if (!accessDecision.allowed) return null;

        executionReady = true;
        return {
            account: decryptAccountPassword(account),
            reservationGeneration: claim.reservation.reservationGeneration,
            sessionGeneration: String(claim.reservation.reservationGeneration),
            lease,
        };
    } finally {
        if (!executionReady) {
            if (lease) {
                await input.accountPool.releaseExecutionLease(lease).catch(() => undefined);
            }
            await compensateNewProviderReservation();
        }
    }
}

async function releaseProviderAccountReservation(input: {
    operationId: string;
    beinAccountId: string;
    reservationGeneration: number;
}): Promise<boolean> {
    return releaseProviderAccountCausalReservation(prisma, {
        operationId: input.operationId,
        beinAccountId: input.beinAccountId,
        reservationGeneration: input.reservationGeneration,
        authority: {
            kind: 'AUDITED_QUARANTINE_TRANSFER',
            auditId: `pre-mutation-failover:${input.operationId}:${input.reservationGeneration}`,
        },
    });
}

function startExecutionLeaseHeartbeat(
    accountPool: AccountPoolManager,
    lease: AccountExecutionLeaseHandle
): { assertCurrent: () => Promise<void>; stop: () => void } {
    let current = true;
    const timer = setInterval(() => {
        accountPool.renewExecutionLease(lease)
            .then((renewed) => { current = current && renewed; })
            .catch(() => { current = false; });
    }, 30_000);
    timer.unref();
    return {
        assertCurrent: async () => {
            if (!current || !await accountPool.assertExecutionLease(lease)) {
                throw new Error('PROVIDER_EXECUTION_LEASE_LOST');
            }
        },
        stop: () => clearInterval(timer),
    };
}

function baselineInvoices(value: Prisma.JsonValue): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((invoice): invoice is string => typeof invoice === 'string');
}

function unavailableCorrelation(
    outcome: 'INCOMPLETE_SCAN' | 'CHECK_FAILED' | 'PROOF_CONFLICT',
    reasonCode: string
): RenewalFulfillmentCorrelationResult {
    return {
        outcome,
        reasonCode,
        discoveredInvoiceNo: null,
        reportRow: null,
        matchedContract: null,
    };
}

async function verifyRenewalFulfillmentWithProvider(input: {
    operationId: string;
    beinAccountId: string;
    cardNumber: string;
    selectedPackage: Partial<QuotePackage> | null;
    responseData: unknown;
    finalMutationStartedAt: Date | null;
    account: OperationBeinAccount;
    route: EffectiveBeinRoute;
    client: HttpClientService;
    executionLease: AccountExecutionLeaseHandle;
    verificationSource: FulfillmentProofCandidate['verificationSource'];
    assertExecutionCurrent: () => Promise<void>;
}): Promise<RenewalVerificationResult> {
    const config = await getRenewalFulfillmentConfig();
    const active = await getActiveRenewalFulfillmentBaseline(input.operationId);
    if (!active || active.activeBaseline.beinAccountId !== input.beinAccountId) {
        return {
            correlation: unavailableCorrelation('INCOMPLETE_SCAN', 'MISSING_ACTIVE_BASELINE'),
            proofMode: config.proofMode,
            proofCandidate: null,
            baselineId: null,
            completeScan: false,
            pageCount: 0,
            rowCount: 0,
            reportObservedAt: null,
            contractObservedAt: null,
        };
    }
    if (!input.finalMutationStartedAt || !input.selectedPackage?.name || input.selectedPackage.price === undefined) {
        return {
            correlation: unavailableCorrelation('PROOF_CONFLICT', 'MISSING_MUTATION_OR_PACKAGE_CONTEXT'),
            proofMode: config.proofMode,
            proofCandidate: null,
            baselineId: active.activeBaseline.id,
            completeScan: false,
            pageCount: 0,
            rowCount: 0,
            reportObservedAt: null,
            contractObservedAt: null,
        };
    }

    const context = parseResponseDataObject(input.responseData);
    const smartcardType = typeof context.smartcardType === 'string' ? context.smartcardType.toUpperCase() : 'CISCO';
    const purchaseIdentity = boundPurchaseIdentity(context.purchaseIdentity, input.selectedPackage, input.cardNumber, smartcardType);
    if (!purchaseIdentity) {
        return {
            correlation: unavailableCorrelation('PROOF_CONFLICT', 'PACKAGE_QUOTE_CHANGED'),
            proofMode: config.proofMode, proofCandidate: null, baselineId: active.activeBaseline.id,
            completeScan: false, pageCount: 0, rowCount: 0, reportObservedAt: null, contractObservedAt: null,
        };
    }
    let reportObservedAt: Date;
    let report: Awaited<ReturnType<HttpClientService['scanSoldPackagesReport']>>;
    try {
        report = await input.client.scanSoldPackagesReport({
            pageCap: config.reportPageCap,
            scanAttempts: config.reportScanAttempts,
        });
        reportObservedAt = new Date();
    } catch {
        reportObservedAt = new Date();
        return {
            correlation: unavailableCorrelation('CHECK_FAILED', 'SOLD_REPORT_CHECK_FAILED'),
            proofMode: config.proofMode,
            proofCandidate: null,
            baselineId: active.activeBaseline.id,
            completeScan: false,
            pageCount: 0,
            rowCount: 0,
            reportObservedAt,
            contractObservedAt: null,
        };
    }
    await input.assertExecutionCurrent();
    let contractObservedAt: Date;
    let contractCheck: Awaited<ReturnType<HttpClientService['checkCardForSignal']>>;
    try {
        contractCheck = await withSessionRetry(
            input.client,
            input.account,
            input.route,
            () => input.client.checkCardForSignal(input.cardNumber),
            'renewalFulfillmentContractRead',
            input.executionLease
        );
        contractObservedAt = new Date();
    } catch {
        contractObservedAt = new Date();
        return {
            correlation: unavailableCorrelation('CHECK_FAILED', 'CONTRACT_CHECK_FAILED'),
            proofMode: config.proofMode,
            proofCandidate: null,
            baselineId: active.activeBaseline.id,
            completeScan: false,
            pageCount: report.pageCount,
            rowCount: report.rows.length,
            reportObservedAt,
            contractObservedAt,
        };
    }
    await input.assertExecutionCurrent();
    const dealerContextHash = report.dealerContextHash || '';
    const correlation = correlateRenewalFulfillment({
        baseline: {
            outcome: 'COMPLETE',
            invoiceNos: baselineInvoices(active.activeBaseline.invoiceSet),
            dealerContextHash: active.activeBaseline.dealerContextHash,
            capturedAt: active.activeBaseline.capturedAt.toISOString(),
        },
        postReport: {
            outcome: report.outcome,
            rows: report.rows,
            dealerContextHash,
            observedAt: reportObservedAt.toISOString(),
        },
        contractCheck: {
            outcome: contractCheck.success ? 'COMPLETE' : 'CHECK_FAILED',
            contracts: contractCheck.contracts || [],
            observedAt: contractObservedAt.toISOString(),
        },
        target: {
            cardNumber: input.cardNumber,
            itemType: `Card_${smartcardType}`,
            selectedPackageName: input.selectedPackage.name,
            providerAmount: canonicalMoney(purchaseIdentity.price),
            currency: purchaseIdentity.currency,
            providerSerial: purchaseIdentity.providerSerial,
            finalMutationStartedAt: input.finalMutationStartedAt.toISOString(),
        },
    });
    const proofCandidate = correlation.outcome === 'MATCHED' && correlation.reportRow && correlation.matchedContract
        ? {
            operationId: input.operationId,
            beinAccountId: input.beinAccountId,
            cardNumberSnapshot: input.cardNumber,
            invoiceNo: correlation.discoveredInvoiceNo,
            proofKind: 'SOLD_REPORT_CONTRACT_CORRELATION' as const,
            selectedPackageName: input.selectedPackage.name,
            contractPackageName: correlation.matchedContract.package,
            contractStatus: correlation.matchedContract.status,
            contractType: correlation.matchedContract.type,
            contractStartDate: correlation.matchedContract.startDate,
            contractExpiryDate: correlation.matchedContract.expiryDate,
            verificationSource: input.verificationSource,
            providerCheckedAt: contractObservedAt,
            baselineId: active.activeBaseline.id,
            sessionGeneration: active.activeBaseline.sessionGeneration,
            baselineCapturedAt: active.activeBaseline.capturedAt,
            reportObservedAt,
            contractObservedAt,
            reportRowFingerprint: correlation.reportRow.rowFingerprint,
            providerAmount: correlation.reportRow.providerAmount,
            currency: correlation.reportRow.currency,
            reportPackageName: correlation.reportRow.packageName,
            reportItemType: correlation.reportRow.itemType,
            dealerContextHash,
        }
        : null;

    return {
        correlation,
        proofMode: config.proofMode,
        proofCandidate,
        baselineId: active.activeBaseline.id,
        completeScan: report.outcome === 'COMPLETE' && contractCheck.success,
        pageCount: report.pageCount,
        rowCount: report.rows.length,
        reportObservedAt,
        contractObservedAt,
    };
}

async function finalizeRenewalFulfillment(input: {
    operationId: string;
    providerPaymentState: ProviderPaymentState;
    verification: RenewalVerificationResult;
    verificationAttempt: { attemptId: string; attemptNo: number };
    reservationGeneration: number;
}) {
    const { proofCandidate, baselineId } = input.verification;
    if (!proofCandidate || !baselineId) {
        return { status: 'REVIEW_REQUIRED' as const, shouldFinalizeSideEffects: false };
    }
    return finalizeAutomatedRenewalFulfillment({
        operationId: input.operationId,
        providerPaymentState: input.providerPaymentState,
        verificationOutcome: input.verification.correlation.outcome,
        proofMode: input.verification.proofMode,
        verificationAttemptId: input.verificationAttempt.attemptId,
        verificationAttemptNo: input.verificationAttempt.attemptNo,
        baselineId,
        reservationGeneration: input.reservationGeneration,
        proofCandidate,
    });
}

async function scheduleRenewalFulfillmentVerification(input: {
    operationId: string;
    cardNumber: string;
    attemptNo: number;
    retryDueAt: Date | null;
    accountPool: AccountPoolManager;
}): Promise<void> {
    if (!input.retryDueAt) return;
    const delayMs = Math.max(0, input.retryDueAt.getTime() - Date.now());
    const queue = new Queue<OperationJobData>('operations', {
        connection: input.accountPool.getRedis() as never,
    });
    try {
        await queue.add('process-operation', {
            operationId: input.operationId,
            type: 'VERIFY_RENEWAL_FULFILLMENT',
            cardNumber: input.cardNumber,
            verificationAttempt: input.attemptNo + 1,
        }, {
            jobId: `VERIFY_RENEWAL_FULFILLMENT--${input.operationId}--${input.attemptNo + 1}`,
            delay: delayMs,
            attempts: 4,
            backoff: { type: 'exponential', delay: 1_000 },
            removeOnComplete: 100,
            removeOnFail: 1000,
        });
    } finally {
        await queue.close();
    }
}

function storedFinalMutationStartedAt(operation: {
    providerMutationStartedAt: Date | null;
    responseData: unknown;
}): Date | null {
    if (operation.providerMutationStartedAt) return operation.providerMutationStartedAt;
    const data = parseResponseDataObject(operation.responseData);
    const candidate = data.finalProviderMutationStartedAt ??
        data.finalPayRequestStartedAt ??
        data.finalPaySubmittedAt;
    if (typeof candidate !== 'string') return null;
    const parsed = new Date(candidate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function releaseSafeTerminalReservations(
    operationId: string,
    reasonCode: string
): Promise<void> {
    const releasedAt = new Date();
    const releaseReason = ('SAFE_TERMINAL:' + reasonCode).slice(0, 500);
    await prisma.$transaction(async (tx) => {
        await tx.cardLifecycleReservation.updateMany({
            where: { operationId, releasedAt: null },
            data: { releasedAt, releaseReason },
        });
        await tx.providerAccountCausalReservation.updateMany({
            where: { operationId, releasedAt: null },
            data: { releasedAt, releaseReason },
        });
    });
}

async function finalizeRenewalSideEffects(
    operationId: string,
    accountPool: AccountPoolManager
): Promise<void> {
    const operation = await prisma.operation.findUnique({
        where: { id: operationId },
        select: {
            userId: true,
            amount: true,
            cardNumber: true,
            selectedPackage: true,
            beinAccountId: true,
            responseData: true,
            beinAccount: { select: { username: true } },
        },
    });
    if (!operation?.beinAccountId) return;

    await resolveRenewalFulfillmentSafetyIssues(operationId);
    await awardCompletedOperationPointsSafely(operationId);
    await invalidatePackageCache(operation.cardNumber);
    await deleteOperationSessionFromCache(operationId);
    await accountPool.markAccountUsed(operation.beinAccountId, operationId, { durableCompletionCounters: Boolean(operation.userId) });

    const audit = parseResponseDataObject(
        parseResponseDataObject(operation.responseData).auditSnapshot
    );
    if (operation.userId) {
        await deliverCompletionEffects(prisma, { operationId });
        await detectAndRecordOperationIntegrity({
            operationId,
            beinBalanceBefore: toNullableNumber(audit.beinBalanceBefore) ?? undefined,
            beinBalanceAfter: toNullableNumber(audit.beinBalanceAfter) ?? undefined,
            beinUsernameSnapshot: typeof audit.beinUsername === 'string'
                ? audit.beinUsername
                : operation.beinAccount?.username,
            userBalanceBefore: toNullableNumber(audit.userBalanceBefore) ?? undefined,
            userBalanceAfter: toNullableNumber(audit.userBalanceAfter) ?? undefined,
        });
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
            responseData: true,
            providerMutationStartedAt: true,
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

    if (
        operation.providerMutationStartedAt ||
        hasFinalPaymentStarted(operation.status, operation.responseData)
    ) {
        await prisma.operation.updateMany({
            where: {
                id: operationId,
                status: {
                    in: [
                        OperationStatus.AWAITING_FINAL_CONFIRM,
                        OperationStatus.COMPLETING,
                    ],
                },
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
        if (operation.beinAccountId) {
            await accountPool.releaseLock(operation.beinAccountId, operationId).catch((releaseError: unknown) => {
                console.warn(`[HTTP] Failed to release account lock after cancel review handoff: ${getErrMsg(releaseError)}`);
            });
        }
        console.warn(`[HTTP] Cancellation for ${operationId} moved to REVIEW_REQUIRED because final payment may have started`);
        return;
    }

    if (operation.status !== OperationStatus.AWAITING_FINAL_CONFIRM && !cancellationConfirmInProgress) {
        console.warn(`[HTTP] Ignoring CANCEL_CONFIRM for ${operationId}; invalid status ${operation.status}`);
        return;
    }

    // Click Cancel only while the exact causal owner holds a fenced execution lease.
    if (operation.beinAccountId) {
        const reserved = await reserveProviderAccountForFulfillment({
            operationId,
            beinAccountId: operation.beinAccountId,
            accountPool,
        });
        if (reserved) {
            const heartbeat = startExecutionLeaseHeartbeat(accountPool, reserved.lease);
            try {
                await heartbeat.assertCurrent();
                const route = await resolveOperationRoute(reserved.account, {
                    operationId,
                    responseData: operation.responseData,
                    legacyFallback: true,
                });
                const client = await createOperationClient(reserved.account, route);
                const restored = await restoreOperationSession(
                    operationId,
                    operation.responseData,
                    client,
                    route
                );
                if (restored) await client.cancelPurchase();
            } catch (error: unknown) {
                console.warn('[HTTP] Provider-side cancellation was not confirmed: ' + getErrMsg(error));
            } finally {
                heartbeat.stop();
                await accountPool.releaseExecutionLease(reserved.lease).catch(() => undefined);
            }
        }
    }

    const cancellation = await finalizePreMutationRenewalTermination({
        operationId,
        terminalStatus: 'CANCELLED',
        allowedStatuses: cancellationConfirmInProgress
            ? [OperationStatus.COMPLETING]
            : [OperationStatus.AWAITING_FINAL_CONFIRM],
        responseMessage: 'Operation cancelled',
        releaseReason: 'USER_CANCELLED_PRE_FINAL_MUTATION',
    });
    if (cancellation.status === 'REVIEW_REQUIRED' || cancellation.status === 'EVIDENCE_CONFLICT') {
        console.warn(`[HTTP] CANCEL_CONFIRM for ${operationId} requires review: ${cancellation.reason}`);
        return;
    }

    if (operation.userId) {
        await createNotification({
            userId: operation.userId,
            title: 'Operation cancelled',
            message: cancellation.refundId ? 'Purchase cancelled and amount refunded' : 'Purchase cancelled',
            type: 'info',
            link: '/dashboard/history'
        });
    }

    if (operation.beinAccountId) {
        await accountPool.markAccountUsed(operation.beinAccountId, operationId);
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

    const route = await resolveOperationRoute(account, {
        operationId,
        ignoreSnapshot: true
    });

    // Store account reference
    if (!await updateOperationIfActive(operationId, {
        beinAccountId: account.id,
        responseData: JSON.stringify(responseDataWithRoute(null, route))
    }, 'SIGNAL_REFRESH account update')) {
        await accountPool.markAccountUsed(account.id);
        return;
    }

    const reservedSignalRefreshExecution = await reserveProviderAccountForFulfillment({
        operationId,
        beinAccountId: account.id,
        accountPool,
        consumer: 'SIGNAL',
    });
    if (!reservedSignalRefreshExecution) {
        throw new Error('SIGNAL_PROVIDER_ACCOUNT_RESERVATION_UNAVAILABLE');
    }
    const signalRefreshLeaseHeartbeat = startExecutionLeaseHeartbeat(
        accountPool,
        reservedSignalRefreshExecution.lease
    );

    // Get or create HTTP client for this account (includes session restore from Redis)
    const httpClient = await createOperationClient(account, route);

    try {
        await signalRefreshLeaseHeartbeat.assertCurrent();
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
                    const cachedSession = await getSessionFromCache(account.id, route.routeKey);
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
            await signalRefreshLeaseHeartbeat.assertCurrent();
            const loginResult = await httpClient.login(account.username, account.password, account.totpSecret || undefined);
            await signalRefreshLeaseHeartbeat.assertCurrent();

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
                        await releaseSafeTerminalReservations(operationId, 'SIGNAL_REFRESH_ABORTED');
                        return;
                    }

                    solution = await waitForCaptchaSolution(operationId);
                    if (!solution) {
                        await releaseLoginLock(account.id, WORKER_ID);
                        throw new Error('CAPTCHA_TIMEOUT: Verification code was not entered');
                    }
                }

                // Submit with CAPTCHA
                await signalRefreshLeaseHeartbeat.assertCurrent();
                const loginWithCaptcha = await httpClient.submitLogin(
                    account.username,
                    account.password,
                    account.totpSecret || undefined,
                    solution
                );
                await signalRefreshLeaseHeartbeat.assertCurrent();

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
                const saved = await saveSessionToCacheFenced(getRedisConnection(), {
                    accountId: account.id,
                    routeKey: route.routeKey,
                    session: prepareSharedSessionForCache(sessionData),
                    ttlSeconds: sessionTimeout,
                    lease: reservedSignalRefreshExecution.lease,
                });
                if (!saved) throw new Error('PROVIDER_EXECUTION_LEASE_LOST_DURING_SESSION_SAVE');
                console.log(`[HTTP] 💾 Session saved to Redis cache (TTL: ${sessionTimeout} min)`);
            } catch (saveError) {
                if (getErrMsg(saveError).includes('PROVIDER_EXECUTION_LEASE_LOST')) throw saveError;
                console.error(`[HTTP] ⚠️ Failed to save session to cache:`, saveError);
            }

            // Release login lock
            await releaseLoginLock(account.id, WORKER_ID);
        }

        await checkIfCancelled(operationId);

        // Step 2: Activate signal
        await updateProgress(operationId, 'Refreshing signal...');
        await signalRefreshLeaseHeartbeat.assertCurrent();
        const signalResult = await withSessionRetry(
            httpClient,
            account,
            route,
            () => httpClient.activateSignal(cardNumber),
            'activateSignal',
            reservedSignalRefreshExecution.lease
        );
        await signalRefreshLeaseHeartbeat.assertCurrent();

        if (!signalResult.success) {
            throw new Error(signalResult.error || 'Signal activation failed');
        }

        // Store card status and capture the immutable completion snapshot atomically.
        await signalRefreshLeaseHeartbeat.assertCurrent();
        const signalRefreshCompletedAt = new Date();
        const signalRefreshCompleted = await prisma.$transaction(async (tx) => {
            const update = await tx.operation.updateMany({
                where: {
                    id: operationId,
                    status: { notIn: TERMINAL_STATUS_LIST }
                },
                data: {
                    status: 'COMPLETED',
                    completedAt: signalRefreshCompletedAt,
                    stbNumber: signalResult.cardStatus?.stbNumber,
                    responseMessage: signalResult.activated
                        ? 'Signal activated successfully'
                        : signalResult.message || 'Card status retrieved',
                    responseData: responseDataWithRoute({
                        cardStatus: signalResult.cardStatus,
                        activated: signalResult.activated
                    }, route)
                }
            });
            if (update.count > 0) {
                await captureOperationSpendAwardRunInTransaction(
                    tx,
                    operationId,
                    'WORKER_SIGNAL_REFRESH',
                    signalRefreshCompletedAt
                );
            }
            return update;
        });
        if (signalRefreshCompleted.count === 0) {
            await accountPool.markAccountUsed(account.id);
            await releaseSafeTerminalReservations(operationId, 'SIGNAL_REFRESH_TERMINAL_RACE');
            return;
        }
        await awardCompletedOperationPointsSafely(operationId);

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
        await releaseSafeTerminalReservations(operationId, 'SIGNAL_REFRESH_COMPLETED');

        console.log(`✅ [HTTP] Signal refresh completed for ${operationId}`);

    } catch (error: unknown) {
        // Mark account as used even on failure
        await accountPool.markAccountUsed(account.id);
        throw error;
    } finally {
        signalRefreshLeaseHeartbeat.stop();
        await accountPool.releaseExecutionLease(reservedSignalRefreshExecution.lease).catch(() => false);
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

    const route = await resolveOperationRoute(account, {
        operationId,
        ignoreSnapshot: true
    });

    // Store account reference
    if (!await updateOperationIfActive(operationId, {
        beinAccountId: account.id,
        responseData: JSON.stringify(responseDataWithRoute(null, route))
    }, 'SIGNAL_CHECK account update')) {
        await accountPool.markAccountUsed(account.id);
        return;
    }

    const reservedSignalExecution = await reserveProviderAccountForFulfillment({
        operationId,
        beinAccountId: account.id,
        accountPool,
        consumer: 'SIGNAL',
    });
    if (!reservedSignalExecution) {
        throw new Error('SIGNAL_PROVIDER_ACCOUNT_RESERVATION_UNAVAILABLE');
    }
    const signalLeaseHeartbeat = startExecutionLeaseHeartbeat(
        accountPool,
        reservedSignalExecution.lease
    );

    const httpClient = await createOperationClient(account, route);

    try {
        await signalLeaseHeartbeat.assertCurrent();
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
                    const cachedSession = await getSessionFromCache(account.id, route.routeKey);
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
                    const saved = await saveSessionToCacheFenced(getRedisConnection(), {
                        accountId: account.id,
                        routeKey: route.routeKey,
                        session: prepareSharedSessionForCache(loginSessionData),
                        ttlSeconds: sessionTimeout,
                        lease: reservedSignalExecution.lease,
                    });
                    if (!saved) throw new Error('PROVIDER_EXECUTION_LEASE_LOST_DURING_SESSION_SAVE');
                console.log(`[HTTP] 💾 Session saved to Redis cache (TTL: ${sessionTimeout} min)`);
            } catch (saveError) {
                if (getErrMsg(saveError).includes('PROVIDER_EXECUTION_LEASE_LOST')) throw saveError;
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
            route,
            () => httpClient.checkCardForSignal(cardNumber),
            'checkCardForSignal',
            reservedSignalExecution.lease
        );

        if (!checkResult.success) {
            throw new Error(checkResult.error || 'Card check failed');
        }

        // Export session for activation step
        const sessionData = await httpClient.exportSession();
        await saveOperationSessionToCache(operationId, sessionData, 900, route);

        // Store card status and await user to click activate.
        // Use 'COMPLETED' status with awaitingActivate flag to indicate waiting for user to click activate.
        const signalCheckCompletedAt = new Date();
        const signalCheckCompleted = await prisma.$transaction(async (tx) => {
            const update = await tx.operation.updateMany({
                where: {
                    id: operationId,
                    status: { notIn: TERMINAL_STATUS_LIST }
                },
                data: {
                    status: 'COMPLETED',
                    completedAt: signalCheckCompletedAt,
                    stbNumber: checkResult.cardStatus?.stbNumber,
                    responseMessage: 'Card checked - ready for activation',
                    responseData: JSON.stringify(responseDataWithRoute({
                        cardStatus: checkResult.cardStatus,
                        contracts: checkResult.contracts || [], // Include contracts table
                        awaitingActivate: true,
                        checkedAt: signalCheckCompletedAt.toISOString()
                    }, route))
                }
            });
            if (update.count > 0) {
                await captureOperationSpendAwardRunInTransaction(
                    tx,
                    operationId,
                    'WORKER_SIGNAL_CHECK',
                    signalCheckCompletedAt
                );
                // The check has ended. A later Activate deliberately reacquires
                // the same account and reloads the card under a new lease.
                await tx.providerAccountCausalReservation.updateMany({
                    where: { operationId, releasedAt: null },
                    data: { releasedAt: signalCheckCompletedAt, releaseReason: 'SAFE_TERMINAL:SIGNAL_CHECK_COMPLETED' },
                });
                await tx.cardLifecycleReservation.updateMany({
                    where: { operationId, releasedAt: null },
                    data: { releasedAt: signalCheckCompletedAt, releaseReason: 'SAFE_TERMINAL:SIGNAL_CHECK_COMPLETED' },
                });
            }
            return update;
        });
        if (signalCheckCompleted.count === 0) {
            await accountPool.markAccountUsed(account.id);
            return;
        }
        await awardCompletedOperationPointsSafely(operationId);

        // Extend session TTL on successful operation
        await extendSessionTTL(account.id, route.routeKey, httpClient.getSessionTimeout());

        await accountPool.markAccountUsed(account.id);
        console.log(`✅ [HTTP] Signal check completed for ${operationId}`);

    } catch (error: unknown) {
        await accountPool.markAccountUsed(account.id);

        // Delete session from cache on session-related errors
        if (getErrMsg(error).includes('Session expired') || getErrMsg(error).includes('login')) {
            await deleteSessionFromCache(account.id, route.routeKey);
        }

        throw error;
    } finally {
        signalLeaseHeartbeat.stop();
        await accountPool.releaseExecutionLease(reservedSignalExecution.lease).catch(() => false);
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

    const reservedSignalExecution = await reserveProviderAccountForFulfillment({
        operationId,
        beinAccountId: operation.beinAccountId,
        accountPool,
        consumer: 'SIGNAL',
    });
    if (!reservedSignalExecution) {
        throw new Error('SIGNAL_PROVIDER_ACCOUNT_RESERVATION_UNAVAILABLE');
    }
    const account = reservedSignalExecution.account;
    const signalLeaseHeartbeat = startExecutionLeaseHeartbeat(
        accountPool,
        reservedSignalExecution.lease
    );

    const route = await resolveOperationRoute(account, {
        operationId,
        responseData: operation.responseData,
        legacyFallback: true
    });
    const httpClient = await createOperationClient(account, route);

    try {
        await signalLeaseHeartbeat.assertCurrent();
        // Session was parsed above as savedData - restore if available
        if (savedData.checkedAt) {
            validateSessionAge(savedData.checkedAt as string, 'signalActivate');
        }
        const restored = await restoreOperationSession(operationId, operation.responseData, httpClient, route);
        if (restored) console.log(`[HTTP] Restored operation-scoped session for activation`);
        // Use card number from operation or parameter
        const targetCardNumber = cardNumber || operation.cardNumber;

        // Activate signal
        await signalLeaseHeartbeat.assertCurrent();
        const activateResult = await httpClient.activateSignalOnly(targetCardNumber);

        if (!activateResult.success) {
            throw new Error(activateResult.error || 'Activation failed');
        }

        // SIGNAL_CHECK owns the immutable completion snapshot for this reused operation id.
        const signalActivatedAt = new Date();
        const signalActivateCompleted = await prisma.operation.updateMany({
            where: {
                id: operationId,
                status: { notIn: TERMINAL_STATUS_LIST }
            },
            data: {
                status: 'COMPLETED',
                responseMessage: activateResult.activated
                    ? 'Signal activated successfully'
                    : activateResult.message || 'Activation not completed',
                responseData: JSON.stringify(responseDataWithRoute({
                    ...savedData,
                    cardStatus: activateResult.cardStatus,
                    activated: activateResult.activated,
                    awaitingActivate: false,  // Clear the flag
                    activatedAt: signalActivatedAt.toISOString()
                }, route))
            }
        });
        if (signalActivateCompleted.count === 0) {
            await accountPool.markAccountUsed(account.id);
            return;
        }
        await awardCompletedOperationPointsSafely(operationId);

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
        await releaseSafeTerminalReservations(operationId, 'SIGNAL_ACTIVATION_COMPLETED');
        console.log(`✅ [HTTP] Signal activation completed for ${operationId}: activated=${activateResult.activated}`);

    } catch (error: unknown) {
        await accountPool.markAccountUsed(account.id);
        throw error;
    } finally {
        signalLeaseHeartbeat.stop();
        await accountPool.releaseExecutionLease(reservedSignalExecution.lease).catch(() => false);
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
async function handleCheckAccountBalance(
    operationId: string,
    accountId: string,
    accountPool: AccountPoolManager
): Promise<void> {
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
    if (!account.automationExclusive) {
        throw new Error('ACCOUNT_NOT_AUTOMATION_EXCLUSIVE');
    }

    const guardOperationId = `balance:${operationId}`;
    const redis = accountPool.getRedis();
    const workerId = accountPool.getWorkerId();
    const reservationBeforeGuard = await findActiveProviderAccountReservationForAccount(
        prisma,
        accountId
    );
    const accessBeforeGuard = decideProviderAccountConsumerAccess({
        consumer: 'BALANCE',
        activeReservation: reservationBeforeGuard
            ? {
                operationId: reservationBeforeGuard.operationId,
                reservationGeneration: reservationBeforeGuard.reservationGeneration,
            }
            : null,
        requester: null,
    });
    if (!accessBeforeGuard.allowed || await isAccountExecutionLeaseActive(redis, accountId)) {
        throw new Error('ACCOUNT_CAUSALLY_RESERVED');
    }

    const guardAcquired = await lockAccount(
        redis,
        accountId,
        workerId,
        BALANCE_ACCOUNT_LOCK_TTL_SECONDS,
        guardOperationId
    );
    if (!guardAcquired) throw new Error('ACCOUNT_BUSY');

    let guardHeartbeatFailure: Error | null = null;
    let guardHeartbeatInFlight: Promise<void> | null = null;
    const balanceGuardLostError = () => new Error('ACCOUNT_BALANCE_GUARD_LOST');
    const assertBalanceGuardOwnership = async (): Promise<void> => {
        if (guardHeartbeatFailure) throw guardHeartbeatFailure;

        let status;
        try {
            status = await getAccountLockStatus(redis, accountId);
        } catch {
            guardHeartbeatFailure = balanceGuardLostError();
            throw guardHeartbeatFailure;
        }

        if (
            !status.locked ||
            status.ownerWorkerId !== workerId ||
            status.ownerOperationId !== guardOperationId
        ) {
            guardHeartbeatFailure = balanceGuardLostError();
            throw guardHeartbeatFailure;
        }
    };
    const guardHeartbeat = setInterval(() => {
        if (guardHeartbeatInFlight || guardHeartbeatFailure) return;

        const run = (async () => {
            const extended = await extendLock(
                redis,
                accountId,
                workerId,
                BALANCE_ACCOUNT_LOCK_TTL_SECONDS,
                guardOperationId
            );
            if (!extended) throw balanceGuardLostError();
            await assertBalanceGuardOwnership();
        })().catch(() => {
            guardHeartbeatFailure = balanceGuardLostError();
        });
        guardHeartbeatInFlight = run;
        void run.finally(() => {
            if (guardHeartbeatInFlight === run) guardHeartbeatInFlight = null;
        });
    }, BALANCE_ACCOUNT_LOCK_HEARTBEAT_MS);

    try {
        await assertBalanceGuardOwnership();
        const reservationAfterGuard = await findActiveProviderAccountReservationForAccount(
            prisma,
            accountId
        );
        const accessAfterGuard = decideProviderAccountConsumerAccess({
            consumer: 'BALANCE',
            activeReservation: reservationAfterGuard
                ? {
                    operationId: reservationAfterGuard.operationId,
                    reservationGeneration: reservationAfterGuard.reservationGeneration,
                }
                : null,
            requester: null,
        });
        if (!accessAfterGuard.allowed || await isAccountExecutionLeaseActive(redis, accountId)) {
            throw new Error('ACCOUNT_CAUSALLY_RESERVED');
        }
        await assertBalanceGuardOwnership();

    const route = await resolveOperationRoute(account, {
        operationId: guardOperationId,
        ignoreSnapshot: true
    });

    // Get or create HTTP client
    const client = await createOperationClient(account, route);

    // Reload config
    await assertBalanceGuardOwnership();
    await client.reloadConfig();
    await assertBalanceGuardOwnership();

    // Login if needed
    if (!client.isSessionActive()) {
        console.log(`[HTTP] Logging in to fetch balance...`);
        await assertBalanceGuardOwnership();
        const loginResult = await client.login(
            account.username,
            account.password,
            account.totpSecret || undefined
        );
        await assertBalanceGuardOwnership();

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
            await saveSessionToCache(account.id, route.routeKey, prepareSharedSessionForCache(sessionData), sessionTimeout);
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

    console.log('[HTTP] Fetching balance using a test card');

    // Fetch dealer balance
    await assertBalanceGuardOwnership();
    const balanceResult = await client.fetchDealerBalance(testCardNumber);
    await assertBalanceGuardOwnership();

    if (balanceResult.success && balanceResult.balance !== null) {
        // Update the account with the new balance
        await prisma.beinAccount.update({
            where: { id: accountId },
            data: {
                dealerBalance: balanceResult.balance,
                balanceUpdatedAt: new Date()
            }
        });
        await assertBalanceGuardOwnership();
        console.log(`✅ [HTTP] Balance updated: ${balanceResult.balance} USD`);
        await checkAndNotifyLowBalance(accountId, account.label || account.username, balanceResult.balance);
        await assertBalanceGuardOwnership();
    } else {
        console.log(`⚠️ [HTTP] Could not fetch balance: ${balanceResult.error}`);
        throw new Error(balanceResult.error || 'Failed to fetch balance');
    }
    } finally {
        clearInterval(guardHeartbeat);
        if (guardHeartbeatInFlight) await guardHeartbeatInFlight;
        await unlockAccount(
            redis,
            accountId,
            workerId,
            guardOperationId
        ).catch(() => false);
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

    const route = await resolveOperationRoute(selectedAccount, {
        operationId,
        ignoreSnapshot: true
    });

    if (!await updateOperationIfActive(operationId, {
        beinAccountId: selectedAccount.id,
        responseData: JSON.stringify(responseDataWithRoute(null, route))
    }, 'START_INSTALLMENT account update')) {
        await accountPool.markAccountUsed(selectedAccount.id);
        return;
    }

    const reservedInstallmentExecution = await reserveProviderAccountForFulfillment({
        operationId,
        beinAccountId: selectedAccount.id,
        accountPool,
        consumer: 'INSTALLMENT',
    });
    if (!reservedInstallmentExecution) {
        throw new Error('INSTALLMENT_PROVIDER_ACCOUNT_RESERVATION_UNAVAILABLE');
    }
    const installmentLeaseHeartbeat = startExecutionLeaseHeartbeat(
        accountPool,
        reservedInstallmentExecution.lease
    );

    try {
    await installmentLeaseHeartbeat.assertCurrent();

    console.log(`🔑 [HTTP] Using account: ${selectedAccount.label || selectedAccount.username}`);

    // Get HTTP client for this account
    const client = await createOperationClient(selectedAccount, route);
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
                const cachedSession = await getSessionFromCache(selectedAccount.id, route.routeKey);
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
            const saved = await saveSessionToCacheFenced(getRedisConnection(), {
                accountId: selectedAccount.id,
                routeKey: route.routeKey,
                session: prepareSharedSessionForCache(sessionData),
                ttlSeconds: sessionTimeout,
                lease: reservedInstallmentExecution.lease,
            });
            if (!saved) throw new Error('PROVIDER_EXECUTION_LEASE_LOST_DURING_SESSION_SAVE');
            console.log(`[HTTP] 💾 Session saved to Redis cache`);
        } catch (saveError) {
            if (getErrMsg(saveError).includes('PROVIDER_EXECUTION_LEASE_LOST')) throw saveError;
            console.error('[HTTP] Failed to save session to cache:', saveError);
        }

        await releaseLoginLock(selectedAccount.id, WORKER_ID);
    }

    await checkIfCancelled(operationId);

    // Step 2: Load installment details
    await updateProgress(operationId, 'Loading installment data...');
    console.log('[HTTP] Loading installment for card');

    await installmentLeaseHeartbeat.assertCurrent();
    const installmentResult = await client.loadInstallment(cardNumber);

    if (!installmentResult.success) {
        throw new Error(installmentResult.error || 'Failed to load installment');
    }

    if (!installmentResult.hasInstallment) {
        // No installment found - complete with message
        const noInstallmentCompletedAt = new Date();
        const noInstallmentCompleted = await prisma.$transaction(async (tx) => {
            const update = await tx.operation.updateMany({
                where: {
                    id: operationId,
                    status: { notIn: TERMINAL_STATUS_LIST }
                },
                data: {
                    status: 'COMPLETED',
                    responseMessage: 'No installments found for this card',
                    completedAt: noInstallmentCompletedAt
                }
            });
            if (update.count > 0) {
                await captureOperationSpendAwardRunInTransaction(
                    tx,
                    operationId,
                    'WORKER_NO_INSTALLMENT',
                    noInstallmentCompletedAt
                );
            }
            return update;
        });
        if (noInstallmentCompleted.count === 0) {
            await accountPool.markAccountUsed(selectedAccount.id);
            return;
        }
        await awardCompletedOperationPointsSafely(operationId);

        // Release account
        await accountPool.markAccountUsed(selectedAccount.id);
        await releaseSafeTerminalReservations(operationId, 'NO_INSTALLMENT_FOUND');
        return;
    }

    // Installment found - save details and wait for user confirmation
    const now = new Date();
    const confirmExpiry = new Date(now.getTime() + 60_000); // 60 seconds to confirm
    const heartbeatExpiry = new Date(now.getTime() + HEARTBEAT_TTL_SECONDS * 1000);

    if (!await updateOperationIfActive(operationId, {
        status: 'AWAITING_FINAL_CONFIRM',
        // Store installment data in responseData
        responseData: JSON.stringify(responseDataWithRoute({
            installment: installmentResult.installment || null,
            installmentId: installmentIdentity(installmentResult.installment),
            subscriber: installmentResult.subscriber || null,
            dealerBalance: installmentResult.dealerBalance || null,
            dealerBalanceBefore: installmentResult.dealerBalance || null,
            operationPhase: 'FINAL_CONFIRMATION_REQUESTED',
            jobType: 'START_INSTALLMENT',
            finalPaySubmitted: false,
            isInstallment: true // Flag to identify installment operations
        }, route)),
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
    } finally {
        installmentLeaseHeartbeat.stop();
        await accountPool.releaseExecutionLease(reservedInstallmentExecution.lease).catch(() => false);
    }
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

    if (operation.purpose !== 'INSTALLMENT' || operation.cardNumber !== cardNumber || operation.providerMutationStartedAt) {
        const saved = await prisma.operationInstallmentEvidence.findUnique({ where: { operationId } });
        await finalizeInstallmentSettlement({ operationId, expectedCorrelationKey: saved?.correlationKey });
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

    const reservedInstallmentExecution = await reserveProviderAccountForFulfillment({
        operationId,
        beinAccountId: operation.beinAccount.id,
        accountPool,
        consumer: 'INSTALLMENT',
    });
    if (!reservedInstallmentExecution) {
        throw new Error('INSTALLMENT_PROVIDER_ACCOUNT_RESERVATION_UNAVAILABLE');
    }
    const selectedAccount = reservedInstallmentExecution.account;
    const installmentLeaseHeartbeat = startExecutionLeaseHeartbeat(
        accountPool,
        reservedInstallmentExecution.lease
    );
    try {
    await installmentLeaseHeartbeat.assertCurrent();
    const route = await resolveOperationRoute(selectedAccount, {
        operationId,
        responseData: operation.responseData,
        legacyFallback: true
    });

    // Get HTTP client
    const client = await createOperationClient(selectedAccount, route);
    await client.reloadConfig();

    // Ensure session is active — re-login if expired
    if (!client.isSessionActive()) {
        console.log(`[HTTP] ⚠️ Session expired for installment confirm, re-logging in...`);

        // Try to get session from cache first
        const cachedSession = await getSessionFromCache(selectedAccount.id, route.routeKey);
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
                const saved = await saveSessionToCacheFenced(getRedisConnection(), {
                    accountId: selectedAccount.id,
                    routeKey: route.routeKey,
                    session: prepareSharedSessionForCache(sessionData),
                    ttlSeconds: sessionTimeout,
                    lease: reservedInstallmentExecution.lease,
                });
                if (!saved) throw new Error('PROVIDER_EXECUTION_LEASE_LOST_DURING_SESSION_SAVE');
            } catch (saveError) {
                if (getErrMsg(saveError).includes('PROVIDER_EXECUTION_LEASE_LOST')) throw saveError;
                console.error('[HTTP] Failed to save session to cache:', saveError);
            }
        }
    }

    await checkIfCancelled(operationId);

    // Re-load installment to ensure card is loaded and ViewState is fresh
    await updateProgress(operationId, 'Loading installment data...');
    console.log('[HTTP] Re-loading installment before payment...');
    await installmentLeaseHeartbeat.assertCurrent();
    const loadResult = await client.loadInstallment(cardNumber);

    if (!loadResult.success || !loadResult.hasInstallment) {
        await finalizeInstallmentSettlement({ operationId, preMutation: true });
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
    const finalPayResponseData = responseDataWithRoute(mergeOperationPhaseData(operation.responseData, {
        operationPhase: 'FINAL_PAY_SUBMITTED',
        jobType: 'CONFIRM_INSTALLMENT',
        finalPaySubmitted: true,
        finalPaySubmittedAt: new Date().toISOString(),
        dealerBalanceBefore: preFinalInstallmentBalance,
        dealerBalanceBeforeSource: preFinalInstallmentBalance === null ? 'missing' : 'package_load_diagnostic',
        diagnosticDealerBalanceBefore: preFinalInstallmentBalance,
        diagnosticDealerBalanceBeforeSource: preFinalInstallmentBalance === null ? 'missing' : 'package_load_diagnostic',
        providerEvidenceContext: {
            operationId,
            beinAccountId: selectedAccount.id,
            cardNumber,
            packageName: 'Installment',
            packagePrice: operation.amount ?? null,
            contextMatched: true,
        },
        expectedCost: operation.amount ?? null
    }), route);
    if (!await updateOperationIfActive(operationId, {
        responseData: finalPayResponseData
    }, 'CONFIRM_INSTALLMENT final Pay evidence update')) {
        return;
    }
    await installmentLeaseHeartbeat.assertCurrent();
    const loadedInstallmentId = installmentIdentity(loadResult.installment);
    if (!loadedInstallmentId || loadedInstallmentId !== operationResponseData.installmentId ||
        loadResult.installment?.dealerPrice !== operation.amount) {
        await finalizeInstallmentSettlement({ operationId, preMutation: true });
        return;
    }
    const mutationClaim = await claimInstallmentMutation({ operationId, beinAccountId: selectedAccount.id,
        installmentId: loadedInstallmentId, reservationGeneration: reservedInstallmentExecution.reservationGeneration });
    if (mutationClaim.status !== 'CLAIMED') {
        const saved = await prisma.operationInstallmentEvidence.findUnique({ where: { operationId } });
        await finalizeInstallmentSettlement({ operationId, expectedCorrelationKey: saved?.correlationKey });
        return;
    }
    await installmentLeaseHeartbeat.assertCurrent();
    const rawPayResult = await client.payInstallment(() => installmentLeaseHeartbeat.assertCurrent());
    const installmentPayEvidence = buildFinalPayBalanceEvidence({
        operationId,
        beinAccountId: selectedAccount.id,
        cardNumber,
        packageName: 'Installment',
        packagePrice: operation.amount ?? null,
        finalBalanceBefore: toNullableNumber(rawPayResult.beinBalanceBefore),
        finalBalanceAfter: toNullableNumber(rawPayResult.beinBalanceAfter),
        finalBalanceBeforeSource: rawPayResult.beinBalanceBeforeSource,
        finalBalanceAfterSource: rawPayResult.beinBalanceAfterSource,
        diagnosticBalanceBefore: preFinalInstallmentBalance,
    });
    const payResult = {
        ...rawPayResult,
        beinBalanceBefore: installmentPayEvidence.finalBalanceBefore ?? undefined,
        beinBalanceAfter: installmentPayEvidence.finalBalanceAfter ?? undefined
    };
    const payOutcomeDecision = decideFinalPayRefundSafety(payResult, true);
    const installmentPostPayResponseData = responseDataWithRoute(mergeOperationPhaseData(finalPayResponseData, {
        operationPhase: payOutcomeDecision.reviewRequired ? 'POST_FINAL_PAY_REVIEW' : 'FINAL_PAY_SUBMITTED',
        jobType: 'CONFIRM_INSTALLMENT',
        finalPaySubmitted: true,
        dealerBalanceBefore: installmentPayEvidence.finalBalanceBefore,
        dealerBalanceBeforeSource: installmentPayEvidence.finalBalanceBeforeSource,
        dealerBalanceAfter: installmentPayEvidence.finalBalanceAfter,
        dealerBalanceAfterSource: installmentPayEvidence.finalBalanceAfterSource,
        diagnosticDealerBalanceBefore: installmentPayEvidence.diagnosticBalanceBefore,
        diagnosticDealerBalanceBeforeSource: installmentPayEvidence.diagnosticBalanceBeforeSource,
        providerEvidenceState: shouldRecordConfirmedProviderSpend(installmentPayEvidence) ? 'confirmed-final-pay' : 'incomplete-evidence',
        providerEvidenceCapturedAt: installmentPayEvidence.capturedAt,
        providerEvidenceContext: {
            operationId: installmentPayEvidence.operationId,
            beinAccountId: installmentPayEvidence.beinAccountId,
            cardNumber: installmentPayEvidence.cardNumber,
            packageName: installmentPayEvidence.packageName,
            packagePrice: installmentPayEvidence.packagePrice,
            contextMatched: installmentPayEvidence.contextMatched,
        },
        expectedCost: operation.amount ?? null,
        outcomeCategory: payOutcomeDecision.outcomeCategory
    }), route);

    // The legacy HTTP adapter exposes debit evidence, not an attributable due-item receipt.
    // Persist the debit independently and keep settlement UNKNOWN until exact proof is available.
    const ledgerResult = await recordConfirmedBeinSpend({
        operationId, beinAccountId: selectedAccount.id,
        dealerBalanceBefore: toNullableNumber(rawPayResult.beinBalanceBefore),
        dealerBalanceAfter: toNullableNumber(rawPayResult.beinBalanceAfter),
        evidenceSource: 'BALANCE_DELTA',
    });
    await prisma.operationInstallmentEvidence.updateMany({
        where: { operationId, correlationKey: mutationClaim.correlationKey, paymentState: 'UNKNOWN', settlementState: 'UNKNOWN' },
        data: { observedAt: new Date(), paymentState: ledgerResult.status === 'created' || ledgerResult.status === 'already_recorded'
            ? 'CHARGED' : 'UNKNOWN', reasonCode: 'ATTRIBUTABLE_INSTALLMENT_SETTLEMENT_REQUIRED' },
    });
    await updateOperationIfActive(operationId, { responseData: installmentPostPayResponseData }, 'INSTALLMENT_OBSERVATION');
    await finalizeInstallmentSettlement({ operationId, expectedCorrelationKey: mutationClaim.correlationKey });
    await accountPool.markAccountUsed(selectedAccount.id);
    } finally {
        installmentLeaseHeartbeat.stop();
        await accountPool.releaseExecutionLease(reservedInstallmentExecution.lease).catch(() => false);
    }
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
