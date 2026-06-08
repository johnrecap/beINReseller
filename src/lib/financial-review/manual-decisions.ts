import type {
    FinancialReviewDecision,
    FinancialReviewDecisionAction,
    FinancialReviewMetadata,
    FinancialReviewPaymentStatus,
    FinancialReviewEvidence,
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
}

type DecisionGuardResult = {
    allowed: boolean
    reason?: 'MISSING_PROVIDER_CHARGE_EVIDENCE' | 'PROVIDER_CHARGE_EVIDENCE_CONFLICT' | 'MISSING_MANUAL_NO_CHARGE_VERIFICATION'
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
            cardRenewed: true,
            paymentStatus: 'تم تأكيد الدفع',
            ...(typeof actualBeinDebitAmount === 'number' ? { actualBeinDebitAmount } : {}),
        }
    }

    if (action === 'REFUND_CUSTOMER') {
        return {
            cardRenewed: false,
            paymentStatus: 'لم يتم تأكيد الدفع',
            ...(typeof actualBeinDebitAmount === 'number' ? { actualBeinDebitAmount } : {}),
        }
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
        input.evidence.providerEvidenceState === 'manual-verified-paid' ||
        (input.evidence.beinDebitConfirmed && input.evidence.providerEvidenceState !== 'legacy-unverified')

    if (input.action === 'BEIN_EXECUTED_NO_REFUND') {
        if (
            trustedProviderCharge ||
            input.manualVerification?.cardRenewed === true ||
            input.manualVerification?.paymentStatus === 'تم تأكيد الدفع'
        ) {
            return { allowed: true }
        }
        return { allowed: false, reason: 'MISSING_PROVIDER_CHARGE_EVIDENCE' }
    }

    if (trustedProviderCharge) {
        return { allowed: false, reason: 'PROVIDER_CHARGE_EVIDENCE_CONFLICT' }
    }

    if (
        input.manualVerification?.cardRenewed === false ||
        input.manualVerification?.paymentStatus === 'لم يتم تأكيد الدفع'
    ) {
        return { allowed: true }
    }

    return { allowed: false, reason: 'MISSING_MANUAL_NO_CHARGE_VERIFICATION' }
}
