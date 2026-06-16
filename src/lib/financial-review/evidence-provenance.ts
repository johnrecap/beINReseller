import type {
    FinancialReviewDecision,
    FinancialReviewEvidence,
    ProviderEvidenceState,
} from './types'

const MONEY_EPSILON = 0.01

type DebitSource = FinancialReviewEvidence['beinDebitSource']

type ProviderEvidenceInput = {
    userDeductTotal: number | null
    ledgerDebitAmount: number | null
    ledgerConfidence: string | null
    auditDebitAmount: number | null
    auditBeforeSource: string | null
    auditAfterSource: string | null
    latestDecision: FinancialReviewDecision | null
}

export type ProviderEvidenceClassification = {
    providerEvidenceState: ProviderEvidenceState
    providerEvidenceLabel: string
    beinDebitConfirmed: boolean
    beinDebitAmount: number | null
    beinDebitSource: DebitSource
    legacyStoredBeinDebitAmount: number | null
    differenceAmount: number | null
    manualVerification: FinancialReviewDecision | null
}

export function isFinalPayBeforeSource(source: string | null | undefined): boolean {
    return source === 'final_pay_ok_page'
}

export function isFinalPayAfterSource(source: string | null | undefined): boolean {
    return source === 'final_pay_result_page' || source === 'final_pay_balance_check'
}

function roundMoney(value: number): number {
    return Number(value.toFixed(2))
}

function amountDifference(beinDebitAmount: number | null, userDeductTotal: number | null): number | null {
    if (typeof beinDebitAmount !== 'number' || typeof userDeductTotal !== 'number') return null
    return roundMoney(beinDebitAmount - userDeductTotal)
}

function isInflatedLegacyDebit(debitAmount: number | null, userDeductTotal: number | null): boolean {
    if (typeof debitAmount !== 'number' || typeof userDeductTotal !== 'number') return false
    return debitAmount > userDeductTotal + MONEY_EPSILON
}

function hasManualPaidConclusion(decision: FinancialReviewDecision | null): boolean {
    return Boolean(
        decision &&
        (decision.paymentStatus === 'تم تأكيد الدفع' || decision.cardRenewed === true)
    )
}

function hasManualNotPaidConclusion(decision: FinancialReviewDecision | null): boolean {
    return Boolean(
        decision &&
        (decision.paymentStatus === 'لم يتم تأكيد الدفع' || decision.cardRenewed === false)
    )
}

function finalPayConfirmed(input: ProviderEvidenceInput): {
    amount: number
    source: DebitSource
} | null {
    if (
        typeof input.ledgerDebitAmount === 'number' &&
        input.ledgerDebitAmount > 0 &&
        input.ledgerConfidence === 'CONFIRMED_FINAL_PAY'
    ) {
        return { amount: input.ledgerDebitAmount, source: 'ledger' }
    }

    if (
        typeof input.auditDebitAmount === 'number' &&
        input.auditDebitAmount > 0 &&
        isFinalPayBeforeSource(input.auditBeforeSource) &&
        isFinalPayAfterSource(input.auditAfterSource)
    ) {
        return { amount: input.auditDebitAmount, source: 'audit_snapshot' }
    }

    if (
        typeof input.ledgerDebitAmount === 'number' &&
        input.ledgerDebitAmount > 0 &&
        !isInflatedLegacyDebit(input.ledgerDebitAmount, input.userDeductTotal)
    ) {
        return { amount: input.ledgerDebitAmount, source: 'ledger' }
    }

    return null
}

function contractVerified(input: ProviderEvidenceInput): {
    amount: number
    source: DebitSource
} | null {
    if (
        typeof input.ledgerDebitAmount === 'number' &&
        input.ledgerDebitAmount > 0 &&
        input.ledgerConfidence === 'CONTRACT_VERIFIED'
    ) {
        return { amount: input.ledgerDebitAmount, source: 'ledger' }
    }

    return null
}

export function classifyProviderEvidence(input: ProviderEvidenceInput): ProviderEvidenceClassification {
    const trustedSystemDebit = finalPayConfirmed(input)
    const trustedContractDebit = contractVerified(input)
    const trustedProviderDebit = trustedSystemDebit ?? trustedContractDebit
    const latestDecision = input.latestDecision

    if (trustedProviderDebit && latestDecision?.cardRenewed === false) {
        return {
            providerEvidenceState: 'conflict',
            providerEvidenceLabel: 'يوجد خصم مؤكد من beIN لكن نتيجة التجديد اليدوية غير مؤكدة',
            beinDebitConfirmed: true,
            beinDebitAmount: trustedProviderDebit.amount,
            beinDebitSource: trustedProviderDebit.source,
            legacyStoredBeinDebitAmount: null,
            differenceAmount: amountDifference(trustedProviderDebit.amount, input.userDeductTotal),
            manualVerification: latestDecision,
        }
    }

    if (hasManualPaidConclusion(latestDecision)) {
        const manualAmount =
            typeof latestDecision?.actualBeinDebitAmount === 'number' &&
            Number.isFinite(latestDecision.actualBeinDebitAmount)
                ? latestDecision.actualBeinDebitAmount
                : trustedProviderDebit?.amount ?? null

        return {
            providerEvidenceState: 'manual-verified-paid',
            providerEvidenceLabel: 'الأدمن أكد الدفع يدويا',
            beinDebitConfirmed: true,
            beinDebitAmount: manualAmount,
            beinDebitSource: manualAmount === null ? 'none' : 'manual_verification',
            legacyStoredBeinDebitAmount: null,
            differenceAmount: amountDifference(manualAmount, input.userDeductTotal),
            manualVerification: latestDecision,
        }
    }

    if (hasManualNotPaidConclusion(latestDecision)) {
        return {
            providerEvidenceState: 'manual-verified-not-paid',
            providerEvidenceLabel: 'الأدمن أكد أن الدفع لم يتم',
            beinDebitConfirmed: false,
            beinDebitAmount: null,
            beinDebitSource: 'none',
            legacyStoredBeinDebitAmount: trustedSystemDebit?.amount ?? null,
            differenceAmount: null,
            manualVerification: latestDecision,
        }
    }

    if (trustedSystemDebit) {
        return {
            providerEvidenceState: 'confirmed-final-pay',
            providerEvidenceLabel: 'خصم beIN مؤكد من مرحلة الدفع الأخيرة',
            beinDebitConfirmed: true,
            beinDebitAmount: trustedSystemDebit.amount,
            beinDebitSource: trustedSystemDebit.source,
            legacyStoredBeinDebitAmount: null,
            differenceAmount: amountDifference(trustedSystemDebit.amount, input.userDeductTotal),
            manualVerification: null,
        }
    }

    if (trustedContractDebit) {
        return {
            providerEvidenceState: 'contract-verified',
            providerEvidenceLabel: 'beIN contract verified after final Pay',
            beinDebitConfirmed: true,
            beinDebitAmount: trustedContractDebit.amount,
            beinDebitSource: trustedContractDebit.source,
            legacyStoredBeinDebitAmount: null,
            differenceAmount: amountDifference(trustedContractDebit.amount, input.userDeductTotal),
            manualVerification: null,
        }
    }

    const legacyAmount =
        isInflatedLegacyDebit(input.ledgerDebitAmount, input.userDeductTotal)
            ? input.ledgerDebitAmount
            : isInflatedLegacyDebit(input.auditDebitAmount, input.userDeductTotal)
                ? input.auditDebitAmount
                : null

    if (legacyAmount !== null) {
        return {
            providerEvidenceState: 'legacy-unverified',
            providerEvidenceLabel: 'رقم beIN قديم وغير مؤكد، ظاهر للمراجعة فقط',
            beinDebitConfirmed: false,
            beinDebitAmount: null,
            beinDebitSource: 'none',
            legacyStoredBeinDebitAmount: legacyAmount,
            differenceAmount: null,
            manualVerification: null,
        }
    }

    return {
        providerEvidenceState: 'incomplete-evidence',
        providerEvidenceLabel: 'لا توجد أدلة كافية لتأكيد خصم beIN',
        beinDebitConfirmed: false,
        beinDebitAmount: null,
        beinDebitSource: 'none',
        legacyStoredBeinDebitAmount: null,
        differenceAmount: null,
        manualVerification: null,
    }
}
