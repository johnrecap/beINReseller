import type { OperationStatus, OperationType, Prisma } from '@prisma/client'

export const TERMINAL_OPERATION_STATUSES = new Set<OperationStatus>([
    'COMPLETED',
    'REVIEW_REQUIRED',
    'CANCELLED',
    'FAILED',
    'EXPIRED',
])

export const OPERATION_PHASES = [
    'PACKAGE_PREPARATION',
    'FINAL_CONFIRMATION',
    'CANCELLATION_CONFIRM',
    'FINAL_PAY_SUBMITTED',
    'POST_FINAL_PAY_REVIEW',
] as const

export type OperationPhase = (typeof OPERATION_PHASES)[number]

export interface OperationPhaseEvidence {
    phase?: OperationPhase
    jobType?: string
    finalPaySubmitted?: boolean
    finalPaySubmittedAt?: string
    cancelRequestedAt?: string
    dealerBalanceBefore?: number | null
    dealerBalanceAfter?: number | null
    outcomeCategory?: string
}

export type OperationSafetyAction =
    | 'ALLOW_CANCEL_WITH_OPTIONAL_REFUND'
    | 'BLOCK_REFUND_MOVE_TO_REVIEW'
    | 'NOOP_TERMINAL_OPERATION'
    | 'ALLOW_FAILURE_WITH_REFUND'
    | 'ALLOW_FAILURE_NO_REFUND_NEEDED'

export type OperationSafetyReason =
    | 'TERMINAL_OPERATION'
    | 'FINAL_PAYMENT_STARTED'
    | 'PRE_FINAL_PAYMENT'
    | 'NO_CUSTOMER_DEDUCTION'
    | 'REFUND_ALREADY_EXISTS'
    | 'LEGACY_COMPLETING_CONSERVATIVE_REVIEW'

export interface OperationSafetyInput {
    operationId?: string
    operationStatus: OperationStatus
    operationAmount?: number
    operationType?: OperationType
    operationResponseData?: unknown
    customerDeductTransactionExists?: boolean
    refundTransactionExists?: boolean
    currentJobType?: string
    finalPaySubmittedEvidence?: boolean
    confirmedNonChargeEvidence?: boolean
    confirmedBeinChargeEvidence?: boolean
    phaseEvidence?: OperationPhaseEvidence | null
}

export interface SafeRefundDecision {
    action: OperationSafetyAction
    refundAllowed: boolean
    reviewRequired: boolean
    reason: OperationSafetyReason
    humanMessage: string
    finalPayMayHaveStarted: boolean
    customerWasDeducted: boolean
    refundAlreadyExists: boolean
    terminalStatus: boolean
    evidence: Record<string, unknown>
}

export interface CancellationSafetyDecision {
    action: 'cancel' | 'review' | 'reject'
    reason: 'before_final_payment' | 'final_payment_started' | 'terminal'
}

export function isTerminalOperationStatus(status: OperationStatus | null | undefined): boolean {
    return !!status && TERMINAL_OPERATION_STATUSES.has(status)
}

export function getOperationPhaseEvidence(input: unknown): OperationPhaseEvidence | null {
    if (!input || typeof input !== 'object') return null

    const data = input as Record<string, unknown>
    const phase = data.operationPhase ?? data.phase

    if (typeof phase !== 'string' || !OPERATION_PHASES.includes(phase as OperationPhase)) {
        return null
    }

    return {
        phase: phase as OperationPhase,
        jobType: typeof data.jobType === 'string' ? data.jobType : undefined,
        finalPaySubmitted: typeof data.finalPaySubmitted === 'boolean' ? data.finalPaySubmitted : undefined,
        finalPaySubmittedAt: typeof data.finalPaySubmittedAt === 'string' ? data.finalPaySubmittedAt : undefined,
        cancelRequestedAt: typeof data.cancelRequestedAt === 'string' ? data.cancelRequestedAt : undefined,
        dealerBalanceBefore: typeof data.dealerBalanceBefore === 'number' ? data.dealerBalanceBefore : null,
        dealerBalanceAfter: typeof data.dealerBalanceAfter === 'number' ? data.dealerBalanceAfter : null,
        outcomeCategory: typeof data.outcomeCategory === 'string' ? data.outcomeCategory : undefined,
    }
}

export function mergeOperationPhaseEvidence(
    responseData: unknown,
    evidence: OperationPhaseEvidence
): Prisma.InputJsonObject {
    const base = responseData && typeof responseData === 'object' && !Array.isArray(responseData)
        ? responseData as Prisma.InputJsonObject
        : {}

    return {
        ...base,
        operationPhase: evidence.phase,
        jobType: evidence.jobType ?? base.jobType,
        finalPaySubmitted: evidence.finalPaySubmitted ?? base.finalPaySubmitted,
        finalPaySubmittedAt: evidence.finalPaySubmittedAt ?? base.finalPaySubmittedAt,
        cancelRequestedAt: evidence.cancelRequestedAt ?? base.cancelRequestedAt,
        dealerBalanceBefore: evidence.dealerBalanceBefore ?? base.dealerBalanceBefore,
        dealerBalanceAfter: evidence.dealerBalanceAfter ?? base.dealerBalanceAfter,
        outcomeCategory: evidence.outcomeCategory ?? base.outcomeCategory,
    }
}

export function hasFinalPayStarted(input: OperationSafetyInput): boolean {
    const phaseEvidence = input.phaseEvidence ?? getOperationPhaseEvidence(input.operationResponseData)

    if (input.finalPaySubmittedEvidence || phaseEvidence?.finalPaySubmitted) return true
    if (input.confirmedBeinChargeEvidence) return true
    if (phaseEvidence?.phase === 'FINAL_PAY_SUBMITTED') return true
    if (phaseEvidence?.phase === 'POST_FINAL_PAY_REVIEW') return true
    if (
        phaseEvidence?.phase === 'PACKAGE_PREPARATION' ||
        phaseEvidence?.phase === 'CANCELLATION_CONFIRM' ||
        phaseEvidence?.phase === 'FINAL_CONFIRMATION'
    ) {
        return false
    }

    // Conservative legacy fallback preserves current behavior until phase markers are written.
    return input.operationStatus === 'COMPLETING'
}

export function decideOperationCancellationSafety(input: OperationSafetyInput): CancellationSafetyDecision {
    if (isTerminalOperationStatus(input.operationStatus)) {
        return { action: 'reject', reason: 'terminal' }
    }

    if (hasFinalPayStarted(input)) {
        return { action: 'review', reason: 'final_payment_started' }
    }

    return { action: 'cancel', reason: 'before_final_payment' }
}

export function decideRefundSafety(input: OperationSafetyInput): SafeRefundDecision {
    const terminalStatus = isTerminalOperationStatus(input.operationStatus)
    const refundBlockedStatus =
        input.operationStatus === 'COMPLETED' ||
        input.operationStatus === 'REVIEW_REQUIRED'
    const refundAlreadyExists = input.refundTransactionExists === true
    const customerWasDeducted = input.customerDeductTransactionExists === true || (input.operationAmount ?? 0) > 0
    const finalPayMayHaveStarted = hasFinalPayStarted(input)

    if (refundBlockedStatus) {
        return {
            action: 'NOOP_TERMINAL_OPERATION',
            refundAllowed: false,
            reviewRequired: false,
            reason: 'TERMINAL_OPERATION',
            humanMessage: 'Operation is terminal; refund is blocked.',
            finalPayMayHaveStarted,
            customerWasDeducted,
            refundAlreadyExists,
            terminalStatus,
            evidence: {},
        }
    }

    if (refundAlreadyExists) {
        return {
            action: 'NOOP_TERMINAL_OPERATION',
            refundAllowed: false,
            reviewRequired: false,
            reason: 'REFUND_ALREADY_EXISTS',
            humanMessage: 'Refund already exists; no second refund is allowed.',
            finalPayMayHaveStarted,
            customerWasDeducted,
            refundAlreadyExists,
            terminalStatus,
            evidence: {},
        }
    }

    if (!customerWasDeducted) {
        return {
            action: 'ALLOW_FAILURE_NO_REFUND_NEEDED',
            refundAllowed: false,
            reviewRequired: false,
            reason: 'NO_CUSTOMER_DEDUCTION',
            humanMessage: 'No customer deduction was found; no refund is needed.',
            finalPayMayHaveStarted,
            customerWasDeducted,
            refundAlreadyExists,
            terminalStatus,
            evidence: {},
        }
    }

    if (finalPayMayHaveStarted && !input.confirmedNonChargeEvidence) {
        return {
            action: 'BLOCK_REFUND_MOVE_TO_REVIEW',
            refundAllowed: false,
            reviewRequired: true,
            reason: input.operationStatus === 'COMPLETING'
                ? 'LEGACY_COMPLETING_CONSERVATIVE_REVIEW'
                : 'FINAL_PAYMENT_STARTED',
            humanMessage: 'Final payment may have started; manual review is required before refund.',
            finalPayMayHaveStarted,
            customerWasDeducted,
            refundAlreadyExists,
            terminalStatus,
            evidence: {},
        }
    }

    return {
        action: 'ALLOW_FAILURE_WITH_REFUND',
        refundAllowed: true,
        reviewRequired: false,
        reason: 'PRE_FINAL_PAYMENT',
        humanMessage: 'Refund is allowed before final payment.',
        finalPayMayHaveStarted,
        customerWasDeducted,
        refundAlreadyExists,
        terminalStatus,
        evidence: {},
    }
}
