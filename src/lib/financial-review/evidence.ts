import type { Prisma } from '@prisma/client'
import type {
    FinancialReviewEvidence,
    FinancialReviewItem,
    FinancialReviewMetadata,
    FinancialReviewState,
} from './types'

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
    if (latestDecision?.action === 'REFUND_CUSTOMER' || evidence.hasRefund) return 'refunded'
    if (latestDecision?.action === 'BEIN_EXECUTED_NO_REFUND') return 'bein_executed'
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
    if (operation.status !== 'REVIEW_REQUIRED') return null

    const responseData = parseJsonRecord(operation.responseData)
    const auditSnapshot = getNestedRecord(responseData, 'auditSnapshot')
    const packageInfo = extractSelectedPackage(operation)
    const hasUserDeduction = operation.transactions.some((transaction) => transaction.type === 'OPERATION_DEDUCT')
    const hasRefund = operation.transactions.some((transaction) => transaction.type === 'REFUND')
    const hasCustomerWalletDebit = customerWalletDebitLookup.get(operation.id) === true
    const userDeductTotal = toNullableNumber(auditSnapshot?.userDeductTotal)
    const refundBlocked = auditSnapshot?.refundBlocked === true
    const reason =
        typeof auditSnapshot?.reviewReason === 'string'
            ? auditSnapshot.reviewReason
            : operation.responseMessage || 'عملية غير مكتملة بعد خصم/حجز رصيد وتحتاج قرار يدوي.'
    const reasonCode =
        typeof auditSnapshot?.outcomeCategory === 'string'
            ? auditSnapshot.outcomeCategory
            : typeof auditSnapshot?.reviewSource === 'string'
                ? auditSnapshot.reviewSource
                : null

    const financiallyImpacted =
        hasUserDeduction ||
        hasCustomerWalletDebit ||
        refundBlocked ||
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
        beinBalanceBefore: toNullableNumber(auditSnapshot?.beinBalanceBefore),
        beinBalanceAfter: toNullableNumber(auditSnapshot?.beinBalanceAfter),
        beinDelta: toNullableNumber(auditSnapshot?.beinDelta),
        beinUsername: typeof auditSnapshot?.beinUsername === 'string' ? auditSnapshot.beinUsername : operation.beinAccount?.username || null,
        selectedPackageName: packageInfo.name,
        selectedPackagePrice: packageInfo.price,
        capturedAt: typeof auditSnapshot?.capturedAt === 'string' ? auditSnapshot.capturedAt : null,
        hasUserDeduction,
        hasCustomerWalletDebit,
        hasRefund,
        financiallyImpacted,
    }

    const review = extractFinancialReviewMetadata(operation.responseData)
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
        beinAccount: operation.beinAccount,
        state,
        stateLabel: getStateLabel(state),
        packageName: packageInfo.name,
        packagePrice: packageInfo.price,
        evidence,
        review,
    }
}
