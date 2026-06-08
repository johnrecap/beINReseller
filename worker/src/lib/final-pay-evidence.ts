const MONEY_EPSILON = 0.01;

export type FinalPayBalanceSource =
    | 'final_pay_ok_page'
    | 'final_pay_result_page'
    | 'package_load_diagnostic'
    | 'missing';

export type FinalPayBeforeBalanceSource = 'final_pay_ok_page' | 'missing';
export type FinalPayAfterBalanceSource = 'final_pay_result_page' | 'missing';
export type DiagnosticBalanceSource = 'package_load_diagnostic' | 'missing';

export type FinalPayBalanceEvidenceInput = {
    operationId: string;
    beinAccountId: string;
    cardNumber: string;
    packageName?: string | null;
    packagePrice?: number | null;
    finalBalanceBefore?: number | null;
    finalBalanceAfter?: number | null;
    diagnosticBalanceBefore?: number | null;
    capturedAt?: string;
};

export type FinalPayBalanceEvidence = {
    operationId: string;
    beinAccountId: string;
    cardNumber: string;
    packageName: string | null;
    packagePrice: number | null;
    finalBalanceBefore: number | null;
    finalBalanceAfter: number | null;
    finalBalanceBeforeSource: FinalPayBeforeBalanceSource;
    finalBalanceAfterSource: FinalPayAfterBalanceSource;
    diagnosticBalanceBefore: number | null;
    diagnosticBalanceBeforeSource: DiagnosticBalanceSource;
    confirmedDebitAmount: number | null;
    contextMatched: true;
    capturedAt: string;
};

function toNullableNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function confirmedDebitAmount(before: number | null, after: number | null): number | null {
    if (before === null || after === null) return null;
    const amount = Number((before - after).toFixed(4));
    return amount > MONEY_EPSILON ? amount : null;
}

export function buildFinalPayBalanceEvidence(input: FinalPayBalanceEvidenceInput): FinalPayBalanceEvidence {
    const finalBalanceBefore = toNullableNumber(input.finalBalanceBefore);
    const finalBalanceAfter = toNullableNumber(input.finalBalanceAfter);
    const diagnosticBalanceBefore = toNullableNumber(input.diagnosticBalanceBefore);

    return {
        operationId: input.operationId,
        beinAccountId: input.beinAccountId,
        cardNumber: input.cardNumber,
        packageName: input.packageName || null,
        packagePrice: toNullableNumber(input.packagePrice),
        finalBalanceBefore,
        finalBalanceAfter,
        finalBalanceBeforeSource: finalBalanceBefore === null ? 'missing' : 'final_pay_ok_page',
        finalBalanceAfterSource: finalBalanceAfter === null ? 'missing' : 'final_pay_result_page',
        diagnosticBalanceBefore,
        diagnosticBalanceBeforeSource: diagnosticBalanceBefore === null ? 'missing' : 'package_load_diagnostic',
        confirmedDebitAmount: confirmedDebitAmount(finalBalanceBefore, finalBalanceAfter),
        contextMatched: true,
        capturedAt: input.capturedAt || new Date().toISOString(),
    };
}

export function shouldRecordConfirmedProviderSpend(evidence: FinalPayBalanceEvidence): boolean {
    return evidence.contextMatched === true &&
        evidence.finalBalanceBeforeSource === 'final_pay_ok_page' &&
        evidence.finalBalanceAfterSource === 'final_pay_result_page' &&
        typeof evidence.confirmedDebitAmount === 'number' &&
        evidence.confirmedDebitAmount > MONEY_EPSILON;
}
