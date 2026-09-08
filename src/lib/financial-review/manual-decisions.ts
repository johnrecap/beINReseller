import type {
    FinancialReviewDecision,
    FinancialReviewDecisionAction,
    FinancialReviewMetadata,
    FinancialReviewPaymentStatus,
    FinancialReviewEvidence,
    FinancialReviewManualFulfillmentEvidenceInput,
} from './types'

type DecisionInput = Omit<FinancialReviewDecision, 'paymentStatus'> & {
    paymentStatus?: FinancialReviewPaymentStatus | null
}

export type FinancialReviewManualVerification = {
    cardRenewed?: boolean
    actualBeinDebitAmount?: number
    paymentStatus?: FinancialReviewPaymentStatus
}

type DecisionGuardInput = {
    action: FinancialReviewDecisionAction
    evidence: FinancialReviewEvidence
    manualVerification?: FinancialReviewManualVerification | null
    manualFulfillmentEvidence?: FinancialReviewManualFulfillmentEvidenceInput | null
}

type DecisionGuardResult = {
    allowed: boolean
    reason?:
        | 'MISSING_PROVIDER_CHARGE_EVIDENCE'
        | 'PROVIDER_CHARGE_EVIDENCE_CONFLICT'
        | 'MISSING_MANUAL_NO_CHARGE_VERIFICATION'
        | 'CONFIRMED_NO_CHARGE_EVIDENCE_REQUIRED'
}

function hasCompleteManualFulfillmentEvidence(
    evidence: FinancialReviewManualFulfillmentEvidenceInput | null | undefined
): boolean {
    if (!evidence) return false
    const observedAt = new Date(evidence.observedAt)
    return Boolean(
        evidence.invoiceNo.trim() &&
        evidence.cardNumber.trim() &&
        evidence.packageName.trim() &&
        /^\d+(?:\.\d{1,2})?$/.test(evidence.providerAmount.trim()) &&
        Number(evidence.providerAmount) > 0 &&
        /^[A-Z]{3}$/.test(evidence.currency.trim()) &&
        evidence.evidenceSource.trim() &&
        evidence.evidenceNote.trim() &&
        Number.isFinite(observedAt.getTime())
    )
}

export function canRecordFinancialReviewDecisionForStatus(input: {
    operationStatus: string
    action: FinancialReviewDecisionAction
}): boolean {
    if (input.operationStatus === 'REVIEW_REQUIRED') return true
    return input.operationStatus === 'COMPLETED' && input.action === 'BEIN_EXECUTED_NO_REFUND'
}

export function getDefaultPaymentStatus(action: FinancialReviewDecisionAction): FinancialReviewPaymentStatus | null {
    if (action === 'BEIN_EXECUTED_NO_REFUND') return 'تم تأكيد الدفع'
    if (action === 'REFUND_CUSTOMER') return 'لم يتم تأكيد الدفع'
    return null
}

export function normalizeManualVerificationForAction(
    action: FinancialReviewDecisionAction,
    manualVerification?: FinancialReviewManualVerification | null
): FinancialReviewManualVerification | null {
    const actualBeinDebitAmount =
        typeof manualVerification?.actualBeinDebitAmount === 'number' &&
            Number.isFinite(manualVerification.actualBeinDebitAmount)
            ? manualVerification.actualBeinDebitAmount
            : undefined

    if (action === 'BEIN_EXECUTED_NO_REFUND') {
        return {
            ...(typeof manualVerification?.cardRenewed === 'boolean'
                ? { cardRenewed: manualVerification.cardRenewed }
                : {}),
            paymentStatus: 'تم تأكيد الدفع',
            ...(typeof actualBeinDebitAmount === 'number' ? { actualBeinDebitAmount } : {}),
        }
    }

    if (action === 'REFUND_CUSTOMER') {
        const normalized = {
            ...(typeof manualVerification?.cardRenewed === 'boolean'
                ? { cardRenewed: manualVerification.cardRenewed }
                : {}),
            ...(manualVerification?.paymentStatus
                ? { paymentStatus: manualVerification.paymentStatus }
                : {}),
            ...(typeof actualBeinDebitAmount === 'number' ? { actualBeinDebitAmount } : {}),
        }
        return Object.keys(normalized).length > 0 ? normalized : null
    }

    return manualVerification || null
}

export function appendManualReviewDecision(
    current: FinancialReviewMetadata,
    input: DecisionInput
): FinancialReviewMetadata {
    const defaultPaymentStatus = getDefaultPaymentStatus(input.action)
    const paymentStatus = input.paymentStatus === null
        ? undefined
        : input.paymentStatus ?? defaultPaymentStatus ?? undefined

    const { paymentStatus: ignoredPaymentStatus, ...decisionBase } = input
    void ignoredPaymentStatus
    const decision: FinancialReviewDecision = {
        ...decisionBase,
        note: input.note.trim(),
        source: input.source ?? 'admin_manual_review',
        ...(paymentStatus ? { paymentStatus } : {}),
    }

    return {
        ...current,
        latestDecision: decision,
        decisions: [...(current.decisions || []), decision],
    }
}

export function isFinancialReviewDecisionAllowed(input: DecisionGuardInput): DecisionGuardResult {
    if (input.action === 'KEEP_UNDER_REVIEW') return { allowed: true }

    const trustedProviderCharge =
        input.evidence.providerEvidenceState === 'confirmed-final-pay' ||
        input.evidence.providerEvidenceState === 'contract-verified' ||
        input.evidence.providerEvidenceState === 'manual-verified-paid' ||
        (input.evidence.beinDebitConfirmed && input.evidence.providerEvidenceState !== 'legacy-unverified')

    if (input.action === 'BEIN_EXECUTED_NO_REFUND') {
        if (
            (
                input.evidence.fulfillmentVerified &&
                Boolean(input.evidence.fulfillmentProofId) &&
                input.evidence.fulfillmentAuthority === 'AUTOMATED_COMPOSITE'
            ) ||
            hasCompleteManualFulfillmentEvidence(input.manualFulfillmentEvidence)
        ) {
            return { allowed: true }
        }
        return { allowed: false, reason: 'MISSING_PROVIDER_CHARGE_EVIDENCE' }
    }

    if (trustedProviderCharge) {
        return { allowed: false, reason: 'PROVIDER_CHARGE_EVIDENCE_CONFLICT' }
    }

    return { allowed: false, reason: 'CONFIRMED_NO_CHARGE_EVIDENCE_REQUIRED' }
}
