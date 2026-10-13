import type { Prisma } from '@prisma/client'
import { quoteData } from '../../../shared/operations/package-quote'
import { hasProvenUnsubmittedPayment } from '../../../shared/operations/renewal-pre-payment'

export type ReviewAction = 'KEEP_UNDER_REVIEW' | 'BEIN_EXECUTED_NO_REFUND' | 'REFUND_CUSTOMER' | 'RESOLVE_PRE_MUTATION'
export type ReviewClassification = 'MODERN_RENEWAL' | 'PRE_MUTATION' | 'LEGACY_RENEWAL' | 'INSTALLMENT' | 'CONFLICT' | 'CLOSED' | 'UNSUPPORTED'
export interface ReviewCapabilities {
    classification: ReviewClassification
    allowedActions: ReviewAction[]
    requiredEvidenceFields: Partial<Record<ReviewAction, string[]>>
    requiredNote: boolean
    blockedReasonCodes: string[]
}
export interface ReviewCapabilityContext {
    id: string; type: string; purpose?: string | null; status: string; userId: string | null; customerId: string | null
    beinAccountId: string | null; cardNumber: string; amount: number; selectedPackage?: unknown; responseData?: unknown
    providerPaymentState?: string | null; providerMutationStartedAt?: Date | null; providerMutationStage?: string | null
    renewalFlowVersion?: number | null
    fulfillmentState?: string | null; fulfillmentVerificationOutcome?: string | null; fulfillmentAuthority?: string | null
    transactions: Array<{ type: string; amount: number; userId?: string | null }>
    dispatches?: Array<{ jobType: string; status: string; attempts: number }>
    refundSettlements?: Array<{ state: string }>
    chargedBeinSpendLedger?: { id: string } | null
    fulfillmentProof?: { id: string } | null
    manualFulfillmentEvidence?: { id: string } | null
    fulfillmentVerification?: { lastOutcome: string | null; nextCheckAt: Date | null;
        attempts: Array<{ outcome: string; completeScan: boolean; retryDueAt: Date | null }> } | null
}

// Additive projection only; consumers never receive raw proof or credentials.
export const reviewCapabilitySelect = {
    id: true, type: true, purpose: true, status: true, userId: true, customerId: true, beinAccountId: true,
    cardNumber: true, amount: true, selectedPackage: true, responseData: true, providerPaymentState: true,
    providerMutationStartedAt: true, providerMutationStage: true, renewalFlowVersion: true, fulfillmentAuthority: true,
    fulfillmentState: true, fulfillmentVerificationOutcome: true,
    transactions: { select: { type: true, amount: true, userId: true } },
    dispatches: { select: { jobType: true, status: true, attempts: true } },
    refundSettlements: { select: { state: true } },
    chargedBeinSpendLedger: { select: { id: true } }, fulfillmentProof: { select: { id: true } },
    manualFulfillmentEvidence: { select: { id: true } },
    fulfillmentVerification: { select: { lastOutcome: true, nextCheckAt: true,
        attempts: { orderBy: { attemptNo: 'desc' }, take: 1,
            select: { outcome: true, completeScan: true, retryDueAt: true } } } },
} as const satisfies Prisma.OperationSelect

export function classifyFinancialReview(operation: ReviewCapabilityContext): ReviewCapabilities {
    const hold = (classification: ReviewClassification, ...blockedReasonCodes: string[]): ReviewCapabilities => ({
        classification, allowedActions: operation.status === 'REVIEW_REQUIRED' ? ['KEEP_UNDER_REVIEW'] : [],
        requiredEvidenceFields: {}, requiredNote: true, blockedReasonCodes,
    })
    const terminalPrePayment = ['FAILED', 'CANCELLED', 'EXPIRED'].includes(operation.status) &&
        hasProvenUnsubmittedPayment(operation)
    if (operation.status !== 'REVIEW_REQUIRED' && !terminalPrePayment) return hold('CLOSED', 'OPERATION_NOT_REVIEWABLE')
    if (operation.type !== 'RENEW' || !operation.userId || operation.customerId) return hold('UNSUPPORTED', 'PANEL_RENEWAL_REQUIRED')
    if (operation.purpose === 'INSTALLMENT') return hold('INSTALLMENT', 'INSTALLMENT_EVIDENCE_HOLD')
    if (operation.fulfillmentProof || operation.manualFulfillmentEvidence ||
        (operation.fulfillmentAuthority && operation.fulfillmentAuthority !== 'NONE') ||
        (!terminalPrePayment && operation.transactions.some(row => row.type === 'REFUND')) || operation.refundSettlements?.some(row => row.state !== 'CANCELLED')) {
        return hold('CONFLICT', 'REVIEW_SETTLEMENT_CONFLICT')
    }
    const deductions = operation.transactions.filter(row => row.type === 'OPERATION_DEDUCT')
    if (terminalPrePayment) {
        const refunds = operation.transactions.filter(row => row.type === 'REFUND')
        const noMoney = operation.amount === 0 && deductions.length === 0 && refunds.length === 0
        const settled = deductions.length === 1 && refunds.length === 1 &&
            deductions[0].userId === operation.userId && refunds[0].userId === operation.userId &&
            deductions[0].amount < 0 && refunds[0].amount > 0 &&
            Math.abs(deductions[0].amount + refunds[0].amount) < 0.005
        if (!noMoney && !settled) return hold('CONFLICT', 'CANONICAL_SETTLEMENT_REQUIRED')
    }
    if (operation.amount === 0 && deductions.length === 0 && hasProvenUnsubmittedPayment(operation)) {
        return { ...hold('PRE_MUTATION'), allowedActions: terminalPrePayment ? ['RESOLVE_PRE_MUTATION']
            : ['KEEP_UNDER_REVIEW', 'RESOLVE_PRE_MUTATION'] }
    }
    if (deductions.length !== 1 || deductions[0].userId !== operation.userId ||
        !Number.isFinite(deductions[0].amount) || deductions[0].amount >= 0 || !Number.isFinite(operation.amount) ||
        Math.round(-deductions[0].amount * 100) !== Math.round(operation.amount * 100)) {
        return hold('CONFLICT', 'CANONICAL_SETTLEMENT_REQUIRED')
    }
    if (hasProvenUnsubmittedPayment(operation)) return { ...hold('PRE_MUTATION'),
        allowedActions: terminalPrePayment ? ['RESOLVE_PRE_MUTATION'] : ['KEEP_UNDER_REVIEW', 'RESOLVE_PRE_MUTATION'] }

    const modern = Boolean(operation.providerMutationStartedAt && operation.providerMutationStage === 'FINAL_OK')
    const result = hold(modern ? 'MODERN_RENEWAL' : 'LEGACY_RENEWAL')
    const selected = quoteData(operation.selectedPackage)
    if (operation.beinAccountId && typeof selected.name === 'string' && selected.name.trim() &&
        Number.isFinite(Number(selected.price)) && Number(selected.price) > 0 &&
        (operation.providerPaymentState === 'UNKNOWN' || operation.providerPaymentState === 'CHARGED' ||
            (!modern && operation.providerPaymentState == null))) {
        result.allowedActions.push('BEIN_EXECUTED_NO_REFUND')
        result.requiredEvidenceFields.BEIN_EXECUTED_NO_REFUND = ['invoiceNo', 'beinAccountId', 'cardNumberSnapshot',
            'packageNameSnapshot', 'providerAmount', 'currency', 'evidenceSource', 'evidenceNote', 'observedAt',
            ...(!modern ? ['decisionKey', 'sourceReference'] : [])]
    }
    const latest = operation.fulfillmentVerification?.attempts[0]
    if (modern && operation.providerPaymentState === 'NOT_CHARGED' && operation.fulfillmentState === 'NOT_FOUND' &&
        operation.fulfillmentVerificationOutcome === 'VALID_NO_MATCH' && !operation.chargedBeinSpendLedger &&
        operation.fulfillmentVerification?.lastOutcome === 'VALID_NO_MATCH' && operation.fulfillmentVerification.nextCheckAt === null &&
        latest?.outcome === 'VALID_NO_MATCH' && latest.completeScan && latest.retryDueAt === null) {
        result.allowedActions.push('REFUND_CUSTOMER')
    } else result.blockedReasonCodes.push(modern ? 'CONFIRMED_NO_CHARGE_EVIDENCE_REQUIRED' : 'LEGACY_NONEXECUTION_EVIDENCE_REQUIRED')
    return result
}
