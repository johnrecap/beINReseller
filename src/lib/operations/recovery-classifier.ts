import type { OperationStatus } from '@prisma/client'
import {
    decideRefundSafety,
    getOperationPhaseEvidence,
    isTerminalOperationStatus,
    type OperationPhaseEvidence,
} from '@/lib/operation-safety'

export type RecoveryDecision =
    | 'EXPIRE'
    | 'CANCEL'
    | 'SAFE_REFUND'
    | 'RETRY_DISPATCH'
    | 'COMPLETE'
    | 'REVIEW_REQUIRED'
    | 'NO_ACTION'

export type RecoveryFinancialImpact =
    | 'NONE'
    | 'CUSTOMER_DEDUCTED'
    | 'PROVIDER_CHARGED'
    | 'UNCERTAIN'

export type RecoverySource =
    | 'heartbeat'
    | 'packages-poll'
    | 'maintenance'
    | 'timeout'
    | 'worker'
    | 'admin'

export interface RecoveryClassifierInput {
    operationId?: string
    status: OperationStatus
    amount?: number | null
    responseData?: unknown
    finalConfirmExpiry?: Date | string | null
    heartbeatExpiry?: Date | string | null
    updatedAt?: Date | string | null
    now?: Date
    customerDeductTransactionExists?: boolean
    refundTransactionExists?: boolean
    dispatchPending?: boolean
    dispatchFailed?: boolean
    dispatchExhausted?: boolean
    providerOutcomeCategory?: string | null
    providerChargeCompletionProof?: boolean
    source?: RecoverySource
}

export interface RecoveryClassifierResult {
    decision: RecoveryDecision
    reason: string
    reviewRequired: boolean
    refundAllowed: boolean
    finalPayMayHaveStarted: boolean
    customerWasDeducted: boolean
    financialImpact: RecoveryFinancialImpact
    phaseEvidence: OperationPhaseEvidence | null
}

function isPast(value: Date | string | null | undefined, now: Date): boolean {
    if (!value) return false
    const date = value instanceof Date ? value : new Date(value)
    return !Number.isNaN(date.getTime()) && date < now
}

function isOlderThan(value: Date | string | null | undefined, now: Date, ageMs: number): boolean {
    if (!value) return false
    const date = value instanceof Date ? value : new Date(value)
    return !Number.isNaN(date.getTime()) && now.getTime() - date.getTime() >= ageMs
}

function getProviderOutcome(input: RecoveryClassifierInput, phaseEvidence: OperationPhaseEvidence | null): string | null {
    return input.providerOutcomeCategory || phaseEvidence?.outcomeCategory || null
}

function financialImpactFor(input: RecoveryClassifierInput, finalPayMayHaveStarted: boolean): RecoveryFinancialImpact {
    if (getProviderOutcome(input, getOperationPhaseEvidence(input.responseData)) === 'CONFIRMED_SUCCESS') {
        return 'PROVIDER_CHARGED'
    }
    if (finalPayMayHaveStarted) return 'UNCERTAIN'
    if (input.customerDeductTransactionExists || (input.amount ?? 0) > 0) return 'CUSTOMER_DEDUCTED'
    return 'NONE'
}

function recoveryDecisionForRefundSafety(
    safetyDecision: ReturnType<typeof decideRefundSafety>,
    noRefundDecision: RecoveryDecision = 'EXPIRE'
): RecoveryDecision {
    if (safetyDecision.refundAllowed) return 'SAFE_REFUND'
    if (safetyDecision.reviewRequired) return 'REVIEW_REQUIRED'
    return noRefundDecision
}

export function classifyRecovery(input: RecoveryClassifierInput): RecoveryClassifierResult {
    const now = input.now ?? new Date()
    const phaseEvidence = getOperationPhaseEvidence(input.responseData)
    const providerOutcome = getProviderOutcome(input, phaseEvidence)
    const safetyDecision = decideRefundSafety({
        operationId: input.operationId,
        operationStatus: input.status,
        operationAmount: input.amount ?? undefined,
        operationResponseData: input.responseData,
        phaseEvidence,
        customerDeductTransactionExists: input.customerDeductTransactionExists,
        refundTransactionExists: input.refundTransactionExists,
        confirmedNonChargeEvidence: providerOutcome === 'CONFIRMED_NOT_CHARGED',
        confirmedBeinChargeEvidence: providerOutcome === 'CONFIRMED_SUCCESS',
    })

    const base = {
        finalPayMayHaveStarted: safetyDecision.finalPayMayHaveStarted,
        customerWasDeducted: safetyDecision.customerWasDeducted,
        phaseEvidence,
    }

    if (isTerminalOperationStatus(input.status)) {
        return {
            ...base,
            decision: 'NO_ACTION',
            reason: 'terminal_operation',
            reviewRequired: false,
            refundAllowed: false,
            financialImpact: financialImpactFor(input, safetyDecision.finalPayMayHaveStarted),
        }
    }

    if (providerOutcome === 'CONFIRMED_SUCCESS') {
        if (input.providerChargeCompletionProof !== true) {
            return {
                ...base,
                decision: 'REVIEW_REQUIRED',
                reason: 'provider_charge_confirmed_missing_recovery_proof',
                reviewRequired: true,
                refundAllowed: false,
                financialImpact: 'UNCERTAIN',
            }
        }

        return {
            ...base,
            decision: 'COMPLETE',
            reason: 'provider_charge_confirmed',
            reviewRequired: false,
            refundAllowed: false,
            financialImpact: 'PROVIDER_CHARGED',
        }
    }

    if (providerOutcome === 'UNCERTAIN_REVIEW_REQUIRED') {
        return {
            ...base,
            decision: 'REVIEW_REQUIRED',
            reason: 'provider_outcome_uncertain',
            reviewRequired: true,
            refundAllowed: false,
            financialImpact: 'UNCERTAIN',
        }
    }

    if (input.status === 'AWAITING_PACKAGE' && (isPast(input.finalConfirmExpiry, now) || isPast(input.heartbeatExpiry, now))) {
        return {
            ...base,
            decision: safetyDecision.refundAllowed ? 'SAFE_REFUND' : 'EXPIRE',
            reason: 'package_selection_expired',
            reviewRequired: safetyDecision.reviewRequired,
            refundAllowed: safetyDecision.refundAllowed,
            financialImpact: financialImpactFor(input, safetyDecision.finalPayMayHaveStarted),
        }
    }

    if (input.status === 'AWAITING_FINAL_CONFIRM' && (isPast(input.finalConfirmExpiry, now) || isPast(input.heartbeatExpiry, now))) {
        return {
            ...base,
            decision: safetyDecision.refundAllowed ? 'SAFE_REFUND' : 'EXPIRE',
            reason: 'final_confirmation_expired',
            reviewRequired: safetyDecision.reviewRequired,
            refundAllowed: safetyDecision.refundAllowed,
            financialImpact: financialImpactFor(input, safetyDecision.finalPayMayHaveStarted),
        }
    }

    if (input.status === 'AWAITING_CAPTCHA' && isPast(input.heartbeatExpiry, now)) {
        return {
            ...base,
            decision: 'EXPIRE',
            reason: 'captcha_expired',
            reviewRequired: false,
            refundAllowed: false,
            financialImpact: 'NONE',
        }
    }

    if (input.status === 'PROCESSING' && isOlderThan(input.updatedAt, now, 5 * 60 * 1000)) {
        if (safetyDecision.finalPayMayHaveStarted) {
            return {
                ...base,
                decision: 'REVIEW_REQUIRED',
                reason: 'processing_timeout_after_final_pay_started',
                reviewRequired: true,
                refundAllowed: false,
                financialImpact: 'UNCERTAIN',
            }
        }

        if (safetyDecision.customerWasDeducted && !phaseEvidence) {
            return {
                ...base,
                decision: 'REVIEW_REQUIRED',
                reason: 'processing_timeout_legacy_deduction_evidence',
                reviewRequired: true,
                refundAllowed: false,
                financialImpact: 'CUSTOMER_DEDUCTED',
            }
        }

        return {
            ...base,
            decision: safetyDecision.refundAllowed ? 'SAFE_REFUND' : 'EXPIRE',
            reason: 'processing_timeout',
            reviewRequired: safetyDecision.reviewRequired,
            refundAllowed: safetyDecision.refundAllowed,
            financialImpact: financialImpactFor(input, safetyDecision.finalPayMayHaveStarted),
        }
    }

    if (input.status === 'COMPLETING') {
        if (
            (input.amount ?? 0) <= 0 &&
            !safetyDecision.finalPayMayHaveStarted &&
            isOlderThan(input.updatedAt, now, 2 * 60 * 1000)
        ) {
            return {
                ...base,
                decision: 'EXPIRE',
                reason: 'completion_stale_before_customer_deduction',
                reviewRequired: false,
                refundAllowed: false,
                financialImpact: 'NONE',
            }
        }

        if (providerOutcome === 'CONFIRMED_NOT_CHARGED') {
            const decision = recoveryDecisionForRefundSafety(safetyDecision)
            return {
                ...base,
                decision,
                reason: 'provider_no_charge_confirmed',
                reviewRequired: decision === 'REVIEW_REQUIRED',
                refundAllowed: safetyDecision.refundAllowed,
                financialImpact: safetyDecision.customerWasDeducted ? 'CUSTOMER_DEDUCTED' : 'NONE',
            }
        }

        if (input.dispatchExhausted && !safetyDecision.finalPayMayHaveStarted) {
            const decision = recoveryDecisionForRefundSafety(safetyDecision)
            return {
                ...base,
                decision,
                reason: 'dispatch_retries_exhausted_before_final_pay',
                reviewRequired: decision === 'REVIEW_REQUIRED',
                refundAllowed: safetyDecision.refundAllowed,
                financialImpact: financialImpactFor(input, false),
            }
        }

        if (input.dispatchPending || input.dispatchFailed) {
            return {
                ...base,
                decision: safetyDecision.finalPayMayHaveStarted ? 'REVIEW_REQUIRED' : 'RETRY_DISPATCH',
                reason: input.dispatchFailed ? 'dispatch_failed' : 'dispatch_pending',
                reviewRequired: safetyDecision.finalPayMayHaveStarted,
                refundAllowed: false,
                financialImpact: financialImpactFor(input, safetyDecision.finalPayMayHaveStarted),
            }
        }

        if (isPast(input.heartbeatExpiry, now) || isPast(input.finalConfirmExpiry, now)) {
            const decision = recoveryDecisionForRefundSafety(safetyDecision)
            return {
                ...base,
                decision,
                reason: 'completion_timeout',
                reviewRequired: decision === 'REVIEW_REQUIRED',
                refundAllowed: safetyDecision.refundAllowed,
                financialImpact: financialImpactFor(input, safetyDecision.finalPayMayHaveStarted),
            }
        }
    }

    return {
        ...base,
        decision: 'NO_ACTION',
        reason: 'not_recoverable_now',
        reviewRequired: false,
        refundAllowed: false,
        financialImpact: financialImpactFor(input, safetyDecision.finalPayMayHaveStarted),
    }
}
