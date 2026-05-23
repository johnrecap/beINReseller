import type { FinalPayOutcomeCategory } from '../../src/http/types';
import { classifyFinalPayOutcome } from '../../src/http/HttpClientService';

export const FINAL_PAY_EXPECTED_COST = 92;
export const FINAL_PAY_BALANCE_BEFORE = 500;

export function classifyFinalPay(overrides: Parameters<typeof classifyFinalPayOutcome>[0] = {} as Parameters<typeof classifyFinalPayOutcome>[0]): FinalPayOutcomeCategory {
    return classifyFinalPayOutcome({
        success: false,
        finalPaySubmitted: true,
        expectedCost: FINAL_PAY_EXPECTED_COST,
        beinBalanceBefore: FINAL_PAY_BALANCE_BEFORE,
        ...overrides,
    });
}

export function balanceAfterDecrease(decrease: number): number {
    return Number((FINAL_PAY_BALANCE_BEFORE - decrease).toFixed(3));
}
