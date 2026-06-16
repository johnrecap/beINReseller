import { parseOperationResponseData } from '@/lib/operation-safety'

const MONEY_EPSILON = 0.01

interface RecoveryProofLedger {
    id: string
    beinAccountId?: string | null
    spendAmount?: number | null
    dealerBalanceBefore?: number | null
    dealerBalanceAfter?: number | null
    evidenceConfidence?: string | null
}

export interface RecoveryProviderBalanceRepairEvidence {
    beinAccountId: string
    cardNumber: string | null
    packageName: string | null
    packagePrice: number | null
    dealerBalanceBefore: number
    dealerBalanceAfter: number
    spendAmount: number
    dealerBalanceBeforeSource: 'final_pay_ok_page'
    dealerBalanceAfterSource: 'final_pay_result_page' | 'final_pay_balance_check'
    diagnosticDealerBalanceBefore: number | null
    diagnosticDealerBalanceBeforeSource: string | null
    capturedAt: string | null
}

function toNullableNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getAuditSnapshot(responseData: unknown): Record<string, unknown> | null {
    const data = parseOperationResponseData(responseData)
    return data.auditSnapshot && typeof data.auditSnapshot === 'object' && !Array.isArray(data.auditSnapshot)
        ? data.auditSnapshot as Record<string, unknown>
        : null
}

function getRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

function toNullableString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function toNullableBoolean(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null
}

function moneyMatches(left: number | null, right: number | null): boolean {
    return left !== null && right !== null && Math.abs(left - right) <= MONEY_EPSILON
}

function auditDebitAmount(auditSnapshot: Record<string, unknown>): number | null {
    const explicitDelta = toNullableNumber(auditSnapshot.beinDelta)
    if (explicitDelta !== null && explicitDelta > MONEY_EPSILON) return explicitDelta

    const before = toNullableNumber(auditSnapshot.beinBalanceBefore)
    const after = toNullableNumber(auditSnapshot.beinBalanceAfter)
    if (before === null || after === null) return null

    const delta = Number((before - after).toFixed(4))
    return delta > MONEY_EPSILON ? delta : null
}

export function hasRecoveryProviderCompletionProof(input: {
    responseData: unknown
    chargedBeinSpendLedger?: RecoveryProofLedger | null
}): boolean {
    const ledger = input.chargedBeinSpendLedger
    if (!ledger?.id) return false

    const ledgerSpend = toNullableNumber(ledger.spendAmount)
    if (ledgerSpend === null || ledgerSpend <= MONEY_EPSILON) return false

    if (ledger.evidenceConfidence && ledger.evidenceConfidence !== 'CONFIRMED_FINAL_PAY') {
        return false
    }

    const auditSnapshot = getAuditSnapshot(input.responseData)
    if (!auditSnapshot) return false

    if (auditSnapshot.providerEvidenceState !== 'confirmed-final-pay') return false
    if (auditSnapshot.outcomeCategory !== 'CONFIRMED_SUCCESS') return false
    if (auditSnapshot.chargedBeinLedgerId !== ledger.id) return false
    if (
        ledger.beinAccountId &&
        typeof auditSnapshot.beinAccountId === 'string' &&
        auditSnapshot.beinAccountId !== ledger.beinAccountId
    ) {
        return false
    }
    if (auditSnapshot.beinBalanceBeforeSource !== 'final_pay_ok_page') return false
    if (
        auditSnapshot.beinBalanceAfterSource !== 'final_pay_result_page' &&
        auditSnapshot.beinBalanceAfterSource !== 'final_pay_balance_check'
    ) {
        return false
    }

    const auditBefore = toNullableNumber(auditSnapshot.beinBalanceBefore)
    const auditAfter = toNullableNumber(auditSnapshot.beinBalanceAfter)
    const ledgerBefore = toNullableNumber(ledger.dealerBalanceBefore)
    const ledgerAfter = toNullableNumber(ledger.dealerBalanceAfter)
    if (
        auditBefore === null ||
        auditAfter === null ||
        ledgerBefore === null ||
        ledgerAfter === null ||
        !moneyMatches(auditBefore, ledgerBefore) ||
        !moneyMatches(auditAfter, ledgerAfter)
    ) {
        return false
    }

    const auditSpend = auditDebitAmount(auditSnapshot)
    if (auditSpend === null) return false

    return Math.abs(auditSpend - ledgerSpend) <= MONEY_EPSILON
}

export function getRecoveryProviderBalanceRepairEvidence(input: {
    responseData: unknown
    operationId: string
    beinAccountId?: string | null
    cardNumber?: string | null
    expectedCost?: number | null
}): RecoveryProviderBalanceRepairEvidence | null {
    const data = parseOperationResponseData(input.responseData)
    const context = getRecord(data.providerEvidenceContext)
    if (!context) return null

    const phase = toNullableString(data.operationPhase ?? data.phase)
    if (phase !== 'FINAL_PAY_SUBMITTED') return null
    if (data.finalPaySubmitted !== true) return null
    if (data.providerEvidenceState !== 'confirmed-final-pay') return null
    if (data.outcomeCategory !== 'CONFIRMED_SUCCESS') return null
    if (data.dealerBalanceBeforeSource !== 'final_pay_ok_page') return null
    const dealerBalanceAfterSource = data.dealerBalanceAfterSource
    if (
        dealerBalanceAfterSource !== 'final_pay_result_page' &&
        dealerBalanceAfterSource !== 'final_pay_balance_check'
    ) {
        return null
    }

    if (context.operationId !== input.operationId) return null
    if (toNullableBoolean(context.contextMatched) !== true) return null

    const contextAccountId = toNullableString(context.beinAccountId)
    if (!contextAccountId) return null
    if (input.beinAccountId && contextAccountId !== input.beinAccountId) return null

    const contextCardNumber = toNullableString(context.cardNumber)
    if (input.cardNumber && contextCardNumber !== input.cardNumber) return null

    const dealerBalanceBefore = toNullableNumber(data.dealerBalanceBefore)
    const dealerBalanceAfter = toNullableNumber(data.dealerBalanceAfter)
    if (dealerBalanceBefore === null || dealerBalanceAfter === null) return null

    const spendAmount = Number((dealerBalanceBefore - dealerBalanceAfter).toFixed(4))
    if (spendAmount <= MONEY_EPSILON) return null

    const responseExpectedCost = toNullableNumber(data.expectedCost)
    const operationExpectedCost = toNullableNumber(input.expectedCost)
    const expectedCost = responseExpectedCost ?? operationExpectedCost
    if (expectedCost === null || expectedCost <= MONEY_EPSILON) return null
    if (!moneyMatches(spendAmount, expectedCost)) return null
    if (operationExpectedCost !== null && !moneyMatches(expectedCost, operationExpectedCost)) return null

    const packagePrice = toNullableNumber(context.packagePrice)
    if (packagePrice !== null && !moneyMatches(packagePrice, expectedCost)) return null

    return {
        beinAccountId: contextAccountId,
        cardNumber: contextCardNumber,
        packageName: toNullableString(context.packageName),
        packagePrice,
        dealerBalanceBefore,
        dealerBalanceAfter,
        spendAmount,
        dealerBalanceBeforeSource: 'final_pay_ok_page',
        dealerBalanceAfterSource,
        diagnosticDealerBalanceBefore: toNullableNumber(data.diagnosticDealerBalanceBefore),
        diagnosticDealerBalanceBeforeSource: toNullableString(data.diagnosticDealerBalanceBeforeSource),
        capturedAt: toNullableString(data.providerEvidenceCapturedAt),
    }
}
