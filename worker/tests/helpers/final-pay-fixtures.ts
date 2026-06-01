import type { FinalPayOutcomeCategory } from '../../src/http/types';
import {
    classifyFinalPayBalanceReadings,
    classifyFinalPayOutcome,
} from '../../src/http/HttpClientService';

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

export const delayedExpectedDecreaseReadings = [
    FINAL_PAY_BALANCE_BEFORE,
    balanceAfterDecrease(FINAL_PAY_EXPECTED_COST),
];

export const unchangedFinalPayReadings = [
    FINAL_PAY_BALANCE_BEFORE,
    FINAL_PAY_BALANCE_BEFORE,
    FINAL_PAY_BALANCE_BEFORE,
];

export const delayedMismatchedDecreaseReadings = [
    FINAL_PAY_BALANCE_BEFORE,
    balanceAfterDecrease(50),
    balanceAfterDecrease(50),
];

export const unreadableFinalPayReadings = [null, null, null];

export function classifyFinalPayReadings(
    balanceReadings: Array<number | null>,
    requiredChecks = balanceReadings.length
): FinalPayOutcomeCategory {
    return classifyFinalPayBalanceReadings({
        success: false,
        message: 'No success confirmation found from beIN',
        finalPaySubmitted: true,
        expectedCost: FINAL_PAY_EXPECTED_COST,
        beinBalanceBefore: FINAL_PAY_BALANCE_BEFORE,
        balanceReadings,
        requiredChecks,
    }).outcomeCategory;
}
