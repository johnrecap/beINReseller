export type FinancialReviewState = 'needs_decision' | 'follow_up' | 'refunded' | 'bein_executed'

export type FinancialReviewDecisionAction =
    | 'BEIN_EXECUTED_NO_REFUND'
    | 'REFUND_CUSTOMER'
    | 'KEEP_UNDER_REVIEW'

export type CardVerificationOutcome =
    | 'LIKELY_RENEWED'
    | 'NOT_CONFIRMED'
    | 'CHECK_FAILED'
    | 'NOT_CHECKED'

export interface FinancialReviewDecision {
    action: FinancialReviewDecisionAction
    note: string
    decidedBy: string
    decidedByUsername: string
    decidedAt: string
    refundApplied?: boolean
}

export interface CardVerificationRecord {
    outcome: CardVerificationOutcome
    summary: string
    checkedBy: string
    checkedByUsername: string
    checkedAt: string
}

export interface FinancialReviewMetadata {
    latestDecision?: FinancialReviewDecision
    decisions?: FinancialReviewDecision[]
    latestCardVerification?: CardVerificationRecord
    cardChecks?: CardVerificationRecord[]
}

export interface FinancialReviewEvidence {
    operationId: string
    reason: string
    reasonCode: string | null
    refundBlocked: boolean
    responseMessage: string | null
    userDeductTotal: number | null
    userBalanceBefore: number | null
    userBalanceAfter: number | null
    beinBalanceBefore: number | null
    beinBalanceAfter: number | null
    beinDelta: number | null
    beinUsername: string | null
    beinAccountId: string | null
    beinAccountLabel: string | null
    beinDebitConfirmed: boolean
    beinDebitAmount: number | null
    beinDebitSource: 'ledger' | 'audit_snapshot' | 'none'
    beinLedgerId: string | null
    beinEvidenceConfidence: string | null
    selectedPackageName: string | null
    selectedPackagePrice: number | null
    capturedAt: string | null
    hasUserDeduction: boolean
    hasCustomerWalletDebit: boolean
    hasRefund: boolean
    financiallyImpacted: boolean
}

export interface FinancialReviewItem {
    id: string
    type: string
    cardNumber: string
    amount: number
    status: string
    createdAt: string
    updatedAt: string
    user: { id: string; username: string; kind: 'reseller' } | null
    customer: { id: string; username: string; kind: 'customer' } | null
    beinAccount: { id: string; username: string | null; label: string | null } | null
    state: FinancialReviewState
    stateLabel: string
    packageName: string | null
    packagePrice: number | null
    evidence: FinancialReviewEvidence
    review: FinancialReviewMetadata
}
