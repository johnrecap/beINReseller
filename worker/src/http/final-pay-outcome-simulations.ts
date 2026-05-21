import { classifyFinalPayOutcome } from './HttpClientService';
import type { FinalPayOutcomeCategory } from './types';

interface Scenario {
    name: string;
    input: Parameters<typeof classifyFinalPayOutcome>[0];
    expected: FinalPayOutcomeCategory;
}

const scenarios: Scenario[] = [
    {
        name: 'success text found',
        input: {
            success: true,
            message: 'Contract Created Successfully',
            finalPaySubmitted: true,
            beinBalanceBefore: 100,
            beinBalanceAfter: 90
        },
        expected: 'CONFIRMED_SUCCESS'
    },
    {
        name: 'dealer balance decreased without success text',
        input: {
            success: false,
            message: 'No success confirmation found from beIN',
            finalPaySubmitted: true,
            beinBalanceBefore: 100,
            beinBalanceAfter: 90
        },
        expected: 'CONFIRMED_SUCCESS'
    },
    {
        name: 'transaction busy after final Pay with unchanged readable balance',
        input: {
            success: false,
            message: 'Transaction is busy on beIN - please check the card status manually',
            finalPaySubmitted: true,
            beinBalanceBefore: 100,
            beinBalanceAfter: 100
        },
        expected: 'CONFIRMED_NOT_CHARGED'
    },
    {
        name: 'no success text and unchanged readable balance',
        input: {
            success: false,
            message: 'No success confirmation found from beIN',
            finalPaySubmitted: true,
            beinBalanceBefore: 100,
            beinBalanceAfter: 100
        },
        expected: 'CONFIRMED_NOT_CHARGED'
    },
    {
        name: 'timeout after final Pay',
        input: {
            success: false,
            message: 'Confirm failed: timeout',
            finalPaySubmitted: true,
            beinBalanceBefore: 100,
            beinBalanceAfter: null
        },
        expected: 'UNCERTAIN_REVIEW_REQUIRED'
    },
    {
        name: 'balance unreadable after final Pay',
        input: {
            success: false,
            message: 'Transaction status unknown - could not verify balance change',
            finalPaySubmitted: true,
            beinBalanceBefore: 100,
            beinBalanceAfter: null
        },
        expected: 'UNCERTAIN_REVIEW_REQUIRED'
    },
    {
        name: 'network failure after final Pay',
        input: {
            success: false,
            message: 'Transaction status unknown - request submitted but confirmation failed: socket hang up',
            finalPaySubmitted: true,
            beinBalanceBefore: 100,
            beinBalanceAfter: null
        },
        expected: 'UNCERTAIN_REVIEW_REQUIRED'
    },
    {
        name: 'clear pre-charge failure',
        input: {
            success: false,
            message: 'ViewState not available',
            finalPaySubmitted: false
        },
        expected: 'CONFIRMED_NOT_CHARGED'
    }
];

export function runFinalPayOutcomeSimulations(): void {
    const failures: string[] = [];

    for (const scenario of scenarios) {
        const actual = classifyFinalPayOutcome(scenario.input);
        if (actual !== scenario.expected) {
            failures.push(`${scenario.name}: expected ${scenario.expected}, got ${actual}`);
        }
    }

    if (failures.length > 0) {
        throw new Error(`Final Pay outcome simulations failed:\n${failures.join('\n')}`);
    }
}

if (require.main === module) {
    runFinalPayOutcomeSimulations();
    console.log(`Final Pay outcome simulations passed: ${scenarios.length}/${scenarios.length}`);
}
