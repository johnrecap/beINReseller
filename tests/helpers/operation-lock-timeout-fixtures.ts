import type { OperationStatus } from '@prisma/client'

export const TEST_NOW = new Date('2026-06-01T10:00:00.000Z')
export const TEST_DEALER_PRICE = 92

export function deadlineAfter(seconds: number, now = TEST_NOW): Date {
    return new Date(now.getTime() + seconds * 1000)
}

export function deadlineBefore(seconds: number, now = TEST_NOW): Date {
    return new Date(now.getTime() - seconds * 1000)
}

export function renewalOperation(overrides: {
    id?: string
    status?: OperationStatus | string
    amount?: number | null
    finalConfirmExpiry?: Date | null
    heartbeatExpiry?: Date | null
    responseData?: unknown
} = {}) {
    return {
        id: overrides.id ?? 'operation-renewal-024',
        status: overrides.status ?? 'AWAITING_PACKAGE',
        amount: overrides.amount ?? 0,
        finalConfirmExpiry: overrides.finalConfirmExpiry ?? deadlineAfter(30),
        heartbeatExpiry: overrides.heartbeatExpiry ?? deadlineAfter(5),
        responseData: overrides.responseData ?? {
            operationPhase: 'PACKAGE_PREPARATION',
            jobType: 'COMPLETE_PURCHASE',
            finalPaySubmitted: false,
            accountLockOwner: 'operation-renewal-024',
        },
    }
}

export function selectedRenewalPackage(overrides: { index?: number; name?: string; price?: number } = {}) {
    return {
        index: overrides.index ?? 0,
        name: overrides.name ?? 'Sports',
        price: overrides.price ?? TEST_DEALER_PRICE,
        checkboxSelector: '#package-0',
    }
}

export function finalPayEvidence() {
    return {
        operationPhase: 'FINAL_PAY_SUBMITTED',
        finalPaySubmitted: true,
        finalPaySubmittedAt: '2026-06-01T10:00:03.000Z',
        jobType: 'CONFIRM_PURCHASE',
        dealerBalanceBefore: 500,
        expectedCost: TEST_DEALER_PRICE,
        accountLockOwner: 'operation-renewal-024',
    }
}
