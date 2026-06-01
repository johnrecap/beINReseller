import type { OperationStatus, Prisma } from '@prisma/client'
import {
    decideOperationCancellationSafety,
    decideRefundSafety,
    mergeOperationPhaseEvidence,
} from '@/lib/operation-safety'
import { isDeadlineExpired } from './timing'

interface RenewalPackageSelectionOperation {
    id: string
    status: OperationStatus | string
    finalConfirmExpiry?: Date | null
    responseData: unknown
}

interface RenewalPackage {
    index: number
    name: string
    price: number
    checkboxSelector?: string
}

export type RenewalPackageSelectionPlan =
    | {
        kind: 'select'
        deductAmount: 0
        releaseAccountLock: false
        operationUpdate: {
            status: 'COMPLETING'
            amount: 0
            selectedPackage: Prisma.InputJsonValue
            promoCode: string | null
            responseData: Prisma.InputJsonObject
        }
    }
    | {
        kind: 'expired'
        deductAmount: 0
        releaseAccountLock: true
        operationUpdate: {
            status: 'EXPIRED'
            responseMessage: string
            responseData: Prisma.InputJsonObject
        }
    }
    | {
        kind: 'insufficient_balance' | 'invalid_state'
        deductAmount: 0
        releaseAccountLock: false
    }

export function planRenewalPackageSelection(input: {
    operation: RenewalPackageSelectionOperation
    selectedPackage: RenewalPackage
    userBalance: number
    now?: Date
    promoCode?: string | null
}): RenewalPackageSelectionPlan {
    const now = input.now ?? new Date()

    if (input.operation.status !== 'AWAITING_PACKAGE') {
        return { kind: 'invalid_state', deductAmount: 0, releaseAccountLock: false }
    }

    if (isDeadlineExpired(input.operation.finalConfirmExpiry, now)) {
        return {
            kind: 'expired',
            deductAmount: 0,
            releaseAccountLock: true,
            operationUpdate: {
                status: 'EXPIRED',
                responseMessage: 'Package selection timed out before payment started.',
                responseData: mergeOperationPhaseEvidence(input.operation.responseData, {
                    phase: 'RECOVERY_TIMEOUT',
                    jobType: 'COMPLETE_PURCHASE',
                    finalPaySubmitted: false,
                }),
            },
        }
    }

    if (input.userBalance < input.selectedPackage.price) {
        return { kind: 'insufficient_balance', deductAmount: 0, releaseAccountLock: false }
    }

    return {
        kind: 'select',
        deductAmount: 0,
        releaseAccountLock: false,
        operationUpdate: {
            status: 'COMPLETING',
            amount: 0,
            selectedPackage: JSON.parse(JSON.stringify(input.selectedPackage)) as Prisma.InputJsonValue,
            promoCode: input.promoCode || null,
            responseData: mergeOperationPhaseEvidence(input.operation.responseData, {
                phase: 'PACKAGE_PREPARATION',
                jobType: 'COMPLETE_PURCHASE',
                finalPaySubmitted: false,
            }),
        },
    }
}

export function planHeartbeatTimeoutAction(input: {
    operationStatus: OperationStatus
    operationAmount?: number | null
    operationResponseData?: unknown
    refundTransactionExists?: boolean
}): {
    action: 'cancel_before_pay' | 'review_after_pay' | 'ignore_terminal'
    releaseAccountLock: boolean
    refundAllowed: boolean
    reviewRequired: boolean
} {
    const cancellation = decideOperationCancellationSafety({
        operationStatus: input.operationStatus,
        operationAmount: input.operationAmount ?? 0,
        operationResponseData: input.operationResponseData,
    })

    if (cancellation.action === 'reject') {
        return {
            action: 'ignore_terminal',
            releaseAccountLock: false,
            refundAllowed: false,
            reviewRequired: false,
        }
    }

    const refund = decideRefundSafety({
        operationStatus: input.operationStatus,
        operationAmount: input.operationAmount ?? 0,
        operationResponseData: input.operationResponseData,
        refundTransactionExists: input.refundTransactionExists,
    })

    if (cancellation.action === 'review') {
        return {
            action: 'review_after_pay',
            releaseAccountLock: true,
            refundAllowed: false,
            reviewRequired: true,
        }
    }

    return {
        action: 'cancel_before_pay',
        releaseAccountLock: true,
        refundAllowed: refund.refundAllowed,
        reviewRequired: false,
    }
}
