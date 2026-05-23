import type { OperationStatus } from '@prisma/client'
import type { RecoveryClassifierInput } from '@/lib/operations/recovery-classifier'

export const RECOVERY_TEST_NOW = new Date('2026-05-24T10:02:00.000Z')
export const RECOVERY_EXPIRED_AT = new Date('2026-05-24T10:00:00.000Z')

export function recoveryInput(overrides: Partial<RecoveryClassifierInput> = {}): RecoveryClassifierInput {
    return {
        status: 'AWAITING_FINAL_CONFIRM' as OperationStatus,
        amount: 0,
        now: RECOVERY_TEST_NOW,
        customerDeductTransactionExists: false,
        refundTransactionExists: false,
        ...overrides,
    }
}

export function preFinalPhase(phase = 'DISPATCH_PENDING') {
    return {
        operationPhase: phase,
        finalPaySubmitted: false,
    }
}

export function finalPaySubmittedPhase() {
    return {
        operationPhase: 'FINAL_PAY_SUBMITTED',
        finalPaySubmitted: true,
        finalPaySubmittedAt: RECOVERY_EXPIRED_AT.toISOString(),
    }
}
