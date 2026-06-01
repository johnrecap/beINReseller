import test from 'node:test';
import assert from 'node:assert/strict';
import {
    FINAL_PAY_BALANCE_BEFORE,
    FINAL_PAY_EXPECTED_COST,
    balanceAfterDecrease,
    classifyFinalPay,
    classifyFinalPayReadings,
    delayedExpectedDecreaseReadings,
    delayedMismatchedDecreaseReadings,
    unchangedFinalPayReadings,
    unreadableFinalPayReadings,
} from './helpers/final-pay-fixtures';

test('classifies explicit success with matching balance delta as confirmed success', () => {
    assert.equal(
        classifyFinalPay({
            success: true,
            beinBalanceAfter: balanceAfterDecrease(FINAL_PAY_EXPECTED_COST),
        }),
        'CONFIRMED_SUCCESS'
    );
});

test('does not classify explicit success with unchanged balance as confirmed success', () => {
    assert.equal(
        classifyFinalPay({
            success: true,
            message: 'Contract Created Successfully',
            beinBalanceAfter: FINAL_PAY_BALANCE_BEFORE,
        }),
        'CONFIRMED_NOT_CHARGED'
    );
});

test('moves explicit success with missing balance evidence to review', () => {
    assert.equal(
        classifyFinalPay({
            success: true,
            message: 'Contract Created Successfully',
            beinBalanceAfter: undefined,
        }),
        'UNCERTAIN_REVIEW_REQUIRED'
    );
});

test('classifies matching balance delta as confirmed success', () => {
    assert.equal(
        classifyFinalPay({
            message: 'Server Error',
            beinBalanceAfter: balanceAfterDecrease(FINAL_PAY_EXPECTED_COST),
        }),
        'CONFIRMED_SUCCESS'
    );
});

test('classifies unchanged balance after final pay as not charged', () => {
    assert.equal(
        classifyFinalPay({
            message: 'No success confirmation found from beIN',
            beinBalanceAfter: FINAL_PAY_BALANCE_BEFORE,
        }),
        'CONFIRMED_NOT_CHARGED'
    );
});

test('classifies mismatched balance delta as review required', () => {
    assert.equal(
        classifyFinalPay({
            message: 'Server Error',
            beinBalanceAfter: balanceAfterDecrease(50),
        }),
        'UNCERTAIN_REVIEW_REQUIRED'
    );
});

test('classifies missing balance evidence after pay submit as review required', () => {
    assert.equal(
        classifyFinalPay({
            message: 'Server Error',
            beinBalanceBefore: undefined,
        }),
        'UNCERTAIN_REVIEW_REQUIRED'
    );
});

test('classifies delayed expected balance decrease as confirmed success', () => {
    assert.equal(classifyFinalPayReadings(delayedExpectedDecreaseReadings, 3), 'CONFIRMED_SUCCESS');
});

test('does not treat first unchanged delayed balance read as confirmed no-charge', () => {
    assert.equal(classifyFinalPayReadings([FINAL_PAY_BALANCE_BEFORE], 3), 'UNCERTAIN_REVIEW_REQUIRED');
});

test('classifies unchanged balance after all delayed checks as confirmed no-charge', () => {
    assert.equal(classifyFinalPayReadings(unchangedFinalPayReadings, 3), 'CONFIRMED_NOT_CHARGED');
});

test('classifies delayed mismatched balance decrease as review required', () => {
    assert.equal(classifyFinalPayReadings(delayedMismatchedDecreaseReadings, 3), 'UNCERTAIN_REVIEW_REQUIRED');
});

test('classifies unreadable delayed balance checks as review required', () => {
    assert.equal(classifyFinalPayReadings(unreadableFinalPayReadings, 3), 'UNCERTAIN_REVIEW_REQUIRED');
});
