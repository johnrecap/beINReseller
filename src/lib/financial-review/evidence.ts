import type { Prisma } from '@prisma/client'
import type {
    FinancialReviewEvidence,
    FinancialReviewItem,
    FinancialReviewMetadata,
    FinancialReviewState,
} from './types'
import { classifyProviderEvidence } from './evidence-provenance'

type JsonRecord = Record<string, unknown>

type ReviewOperation = {
    id: string
    type: string
    cardNumber: string
    amount: number
    status: string
    createdAt: Date
    updatedAt: Date
    responseMessage: string | null
    responseData: Prisma.JsonValue | null
    selectedPackage: Prisma.JsonValue | null
    user: { id: string; username: string } | null
    customer: { id: string; name: string; email: string } | null
    beinAccount: { id: string; username: string | null; label: string | null } | null
    chargedBeinSpendLedger: {
        id: string
        beinAccountId: string
        dealerBalanceBefore: number
        dealerBalanceAfter: number
        spendAmount: number
        evidenceConfidence: string
        beinUsernameSnapshot: string
        beinLabelSnapshot: string | null
    } | null
    transactions: Array<{ type: string; amount: number }>
}

export type CustomerWalletDebitLookup = Map<string, boolean>

export function parseJsonRecord(value: unknown): JsonRecord | null {
    if (!value) return null
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value) as unknown
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? parsed as JsonRecord
                : null
        } catch {
            return null
        }
    }
    return typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

export function toNullableNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getNestedRecord(record: JsonRecord | null, key: string): JsonRecord | null {
    const value = record?.[key]
    return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function toNullableString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function extractSelectedPackage(operation: ReviewOperation) {
    const selectedPackage = parseJsonRecord(operation.selectedPackage)
    const responseData = parseJsonRecord(operation.responseData)
    const responsePackage = getNestedRecord(responseData, 'selectedPackage')
    const source = selectedPackage || responsePackage

    return {
        name: typeof source?.name === 'string' ? source.name : null,
        price: toNullableNumber(source?.price),
    }
}

export function extractFinancialReviewMetadata(responseData: unknown): FinancialReviewMetadata {
    const parsed = parseJsonRecord(responseData)
    const metadata = getNestedRecord(parsed, 'financialReview')
    if (!metadata) return {}
    return metadata as unknown as FinancialReviewMetadata
}

export function withFinancialReviewMetadata(
    responseData: unknown,
    updater: (current: FinancialReviewMetadata) => FinancialReviewMetadata
): Prisma.InputJsonObject {
    const parsed = parseJsonRecord(responseData) || {}
    const current = extractFinancialReviewMetadata(parsed)
    return {
        ...parsed,
        financialReview: updater(current) as unknown as Prisma.InputJsonObject,
    } as Prisma.InputJsonObject
}

function deriveState(review: FinancialReviewMetadata, evidence: FinancialReviewEvidence): FinancialReviewState {
    const latestDecision = review.latestDecision
    if (latestDecision?.action === 'REFUND_CUSTOMER' && latestDecision.refundApplied !== false && evidence.hasRefund) return 'refunded'
    if (latestDecision?.action === 'BEIN_EXECUTED_NO_REFUND' && evidence.beinDebitConfirmed) return 'bein_executed'
    if (latestDecision?.action === 'KEEP_UNDER_REVIEW') return 'follow_up'
    return 'needs_decision'
}

export function getStateLabel(state: FinancialReviewState): string {
    switch (state) {
        case 'needs_decision':
            return 'محتاج قرار'
        case 'follow_up':
            return 'متابعة لاحقا'
        case 'refunded':
            return 'تم رد الفلوس'
        case 'bein_executed':
            return 'تم التأكيد بدون رد'
    }
}

export function buildFinancialReviewItem(
    operation: ReviewOperation,
    customerWalletDebitLookup: CustomerWalletDebitLookup
): FinancialReviewItem | null {
    const responseData = parseJsonRecord(operation.responseData)
    const auditSnapshot = getNestedRecord(responseData, 'auditSnapshot')
    const review = extractFinancialReviewMetadata(operation.responseData)
    if (operation.status !== 'REVIEW_REQUIRED' && !review.latestDecision) return null
    const packageInfo = extractSelectedPackage(operation)
    const hasUserDeduction = operation.transactions.some((transaction) => transaction.type === 'OPERATION_DEDUCT')
    const hasRefund = operation.transactions.some((transaction) => transaction.type === 'REFUND')
    const hasCustomerWalletDebit = customerWalletDebitLookup.get(operation.id) === true
    const userDeductTotal = toNullableNumber(auditSnapshot?.userDeductTotal)
    const recoveryFinancialImpact =
        typeof responseData?.lastRecoveryFinancialImpact === 'string'
            ? responseData.lastRecoveryFinancialImpact
            : null
    const refundBlocked = auditSnapshot?.refundBlocked === true
    const reason =
        typeof auditSnapshot?.reviewReason === 'string'
            ? auditSnapshot.reviewReason
            : typeof responseData?.lastRecoveryReason === 'string'
                ? responseData.lastRecoveryReason
            : operation.responseMessage || 'عملية غير مكتملة بعد خصم/حجز رصيد وتحتاج قرار يدوي.'
    const reasonCode =
        typeof auditSnapshot?.outcomeCategory === 'string'
            ? auditSnapshot.outcomeCategory
            : typeof responseData?.lastRecoveryDecision === 'string'
                ? responseData.lastRecoveryDecision
            : typeof auditSnapshot?.reviewSource === 'string'
                ? auditSnapshot.reviewSource
                : null
    const chargedLedger = operation.chargedBeinSpendLedger
    const responseBeinBalanceBefore =
        toNullableNumber(responseData?.dealerBalanceBefore) ??
        toNullableNumber(responseData?.dealerBalance)
    const responseBeinBalanceAfter = toNullableNumber(responseData?.dealerBalanceAfter)
    const auditBeinBalanceBefore = toNullableNumber(auditSnapshot?.beinBalanceBefore) ?? responseBeinBalanceBefore
    const auditBeinBalanceAfter = toNullableNumber(auditSnapshot?.beinBalanceAfter) ?? responseBeinBalanceAfter
    const auditBeforeSource =
        toNullableString(auditSnapshot?.beinBalanceBeforeSource) ??
        toNullableString(responseData?.dealerBalanceBeforeSource)
    const auditAfterSource =
        toNullableString(auditSnapshot?.beinBalanceAfterSource) ??
        toNullableString(responseData?.dealerBalanceAfterSource)
    const auditBeinDelta = toNullableNumber(auditSnapshot?.beinDelta)
    const ledgerDebitAmount = chargedLedger ? Math.abs(chargedLedger.spendAmount) : null
    const derivedAuditDebitAmount =
        auditBeinBalanceBefore !== null && auditBeinBalanceAfter !== null && auditBeinBalanceBefore > auditBeinBalanceAfter
            ? auditBeinBalanceBefore - auditBeinBalanceAfter
            : null
    const auditDebitAmount = typeof auditBeinDelta === 'number' && auditBeinDelta > 0 ? auditBeinDelta : derivedAuditDebitAmount
    const providerEvidence = classifyProviderEvidence({
        userDeductTotal,
        ledgerDebitAmount,
        ledgerConfidence: chargedLedger?.evidenceConfidence || null,
        auditDebitAmount,
        auditBeforeSource,
        auditAfterSource,
        latestDecision: review.latestDecision || null,
    })
    const resolvedBeinAccount = chargedLedger ? {
        id: chargedLedger.beinAccountId,
        username: chargedLedger.beinUsernameSnapshot,
        label: chargedLedger.beinLabelSnapshot,
    } : operation.beinAccount

    const financiallyImpacted =
        hasUserDeduction ||
        hasCustomerWalletDebit ||
        refundBlocked ||
        recoveryFinancialImpact === 'CUSTOMER_DEDUCTED' ||
        recoveryFinancialImpact === 'UNCERTAIN' ||
        (typeof userDeductTotal === 'number' && userDeductTotal > 0) ||
        (operation.amount > 0 && Boolean(operation.user || operation.customer))

    if (!financiallyImpacted) return null

    const evidence: FinancialReviewEvidence = {
        operationId: operation.id,
        reason,
        reasonCode,
        refundBlocked,
        responseMessage: operation.responseMessage,
        userDeductTotal,
        userBalanceBefore: toNullableNumber(auditSnapshot?.userBalanceBefore),
        userBalanceAfter: toNullableNumber(auditSnapshot?.userBalanceAfter),
        beinBalanceBefore: auditBeinBalanceBefore ?? chargedLedger?.dealerBalanceBefore ?? null,
        beinBalanceAfter: auditBeinBalanceAfter ?? chargedLedger?.dealerBalanceAfter ?? null,
        beinDelta: auditBeinDelta ?? ledgerDebitAmount,
        beinUsername: typeof auditSnapshot?.beinUsername === 'string'
            ? auditSnapshot.beinUsername
            : chargedLedger?.beinUsernameSnapshot || operation.beinAccount?.username || null,
        beinAccountId: resolvedBeinAccount?.id || null,
        beinAccountLabel: resolvedBeinAccount?.label || null,
        beinDebitConfirmed: providerEvidence.beinDebitConfirmed,
        beinDebitAmount: providerEvidence.beinDebitAmount,
        beinDebitSource: providerEvidence.beinDebitSource,
        beinLedgerId: chargedLedger?.id || null,
        beinEvidenceConfidence: chargedLedger?.evidenceConfidence || null,
        providerEvidenceState: providerEvidence.providerEvidenceState,
        providerEvidenceLabel: providerEvidence.providerEvidenceLabel,
        legacyStoredBeinDebitAmount: providerEvidence.legacyStoredBeinDebitAmount,
        differenceAmount: providerEvidence.differenceAmount,
        manualVerification: providerEvidence.manualVerification,
        selectedPackageName: packageInfo.name,
        selectedPackagePrice: packageInfo.price,
        capturedAt: typeof auditSnapshot?.capturedAt === 'string' ? auditSnapshot.capturedAt : null,
        hasUserDeduction,
        hasCustomerWalletDebit,
        hasRefund,
        financiallyImpacted,
    }

    const state = deriveState(review, evidence)

    return {
        id: operation.id,
        type: operation.type,
        cardNumber: operation.cardNumber,
        amount: operation.amount,
        status: operation.status,
        createdAt: operation.createdAt.toISOString(),
        updatedAt: operation.updatedAt.toISOString(),
        user: operation.user ? { ...operation.user, kind: 'reseller' } : null,
        customer: operation.customer ? { id: operation.customer.id, username: operation.customer.name || operation.customer.email, kind: 'customer' } : null,
        beinAccount: resolvedBeinAccount,
        state,
        stateLabel: getStateLabel(state),
        packageName: packageInfo.name,
        packagePrice: packageInfo.price,
        evidence,
        review,
    }
}
