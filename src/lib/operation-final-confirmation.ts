import type { OperationStatus, Prisma } from '@prisma/client'
import { isTerminalOperationStatus, mergeOperationPhaseEvidence } from './operation-safety'
import { isDeadlineExpired } from './operations/timing'

type FinalConfirmationJobType = 'CONFIRM_PURCHASE'

interface RenewalFinalConfirmationOperation {
    id: string
    status: OperationStatus | string
    amount: number | null
    responseData: unknown
    finalConfirmExpiry?: Date | null
    heartbeatExpiry?: Date | null
}

interface RenewalFinalConfirmationInput {
    operation: RenewalFinalConfirmationOperation
    userBalance: number
    dealerPrice: number
    jobType: FinalConfirmationJobType
    now?: Date
}

type RenewalFinalConfirmationPlan =
    | {
        kind: 'confirm' | 'legacy_confirm'
        deductAmount: number
        createDispatch: true
        operationUpdate: {
            status: 'COMPLETING'
            amount: number
            finalConfirmExpiry: null
            heartbeatExpiry: null
            responseData: Prisma.InputJsonObject
        }
    }
    | {
        kind: 'insufficient_balance'
        deductAmount: 0
        createDispatch: false
        operationUpdate: {
            status: 'AWAITING_FINAL_CONFIRM'
            amount: number
            responseData: Prisma.InputJsonObject
        }
    }
    | {
        kind: 'duplicate' | 'invalid_state' | 'expired'
        deductAmount: 0
        createDispatch: false
    }

export function buildRenewalFinalConfirmationEvidence(
    responseData: unknown,
    jobType: FinalConfirmationJobType
): Prisma.InputJsonObject {
    return mergeOperationPhaseEvidence(responseData, {
        phase: 'DISPATCH_PENDING',
        jobType,
        finalPaySubmitted: false,
    })
}

export function planRenewalFinalConfirmation(
    input: RenewalFinalConfirmationInput
): RenewalFinalConfirmationPlan {
    const currentAmount = input.operation.amount ?? 0

    if (input.operation.status === 'COMPLETING' && currentAmount > 0) {
        return { kind: 'duplicate', deductAmount: 0, createDispatch: false }
    }

    if (input.operation.status !== 'AWAITING_FINAL_CONFIRM') {
        return { kind: 'invalid_state', deductAmount: 0, createDispatch: false }
    }

    if (isDeadlineExpired(input.operation.finalConfirmExpiry, input.now)) {
        return { kind: 'expired', deductAmount: 0, createDispatch: false }
    }

    if (currentAmount <= 0 && input.userBalance < input.dealerPrice) {
        return {
            kind: 'insufficient_balance',
            deductAmount: 0,
            createDispatch: false,
            operationUpdate: {
                status: 'AWAITING_FINAL_CONFIRM',
                amount: currentAmount,
                responseData: mergeOperationPhaseEvidence(input.operation.responseData, {
                    phase: 'FINAL_CONFIRMATION',
                    jobType: input.jobType,
                    finalPaySubmitted: false,
                }),
            },
        }
    }

    const finalAmount = currentAmount > 0 ? currentAmount : input.dealerPrice

    return {
        kind: currentAmount > 0 ? 'legacy_confirm' : 'confirm',
        deductAmount: currentAmount > 0 ? 0 : input.dealerPrice,
        createDispatch: true,
        operationUpdate: {
            status: 'COMPLETING',
            amount: finalAmount,
            finalConfirmExpiry: null,
            heartbeatExpiry: null,
            responseData: buildRenewalFinalConfirmationEvidence(input.operation.responseData, input.jobType),
        },
    }
}

export function shouldWorkerSubmitRenewalFinalPay(input: {
    status: OperationStatus | string
    amount: number | null
    responseData: unknown
}): { allowed: boolean; reason: 'allowed' | 'terminal' | 'invalid_status' | 'missing_amount' | 'missing_dispatch_evidence' } {
    if (isTerminalOperationStatus(input.status as OperationStatus)) {
        return { allowed: false, reason: 'terminal' }
    }

    if (input.status !== 'COMPLETING' && input.status !== 'AWAITING_FINAL_CONFIRM') {
        return { allowed: false, reason: 'invalid_status' }
    }

    if (!input.amount || input.amount <= 0) {
        return { allowed: false, reason: 'missing_amount' }
    }

    const data = typeof input.responseData === 'object' && input.responseData && !Array.isArray(input.responseData)
        ? input.responseData as Record<string, unknown>
        : {}
    const phase = data.operationPhase ?? data.phase
    if (phase !== 'DISPATCH_PENDING' && phase !== 'DISPATCH_FAILED' && phase !== 'FINAL_PAY_SUBMITTED') {
        return { allowed: false, reason: 'missing_dispatch_evidence' }
    }

    return { allowed: true, reason: 'allowed' }
}
