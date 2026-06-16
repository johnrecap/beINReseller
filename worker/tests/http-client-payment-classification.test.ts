import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

test('classifies final pay that drains beIN balance to zero as confirmed success', () => {
    assert.equal(
        classifyFinalPay({
            expectedCost: FINAL_PAY_BALANCE_BEFORE,
            beinBalanceAfter: 0,
        }),
        'CONFIRMED_SUCCESS'
    );
});

test('classifies fractional beIN balance delta as confirmed success', () => {
    assert.equal(
        classifyFinalPay({
            expectedCost: 150,
            beinBalanceBefore: 4785.995,
            beinBalanceAfter: 4635.995,
        }),
        'CONFIRMED_SUCCESS'
    );
});

test('preserves zero balance fields in final payment result construction', () => {
    const source = readFileSync(join(process.cwd(), 'worker', 'src', 'http', 'HttpClientService.ts'), 'utf8');
    assert.doesNotMatch(
        source,
        /(newBalance|beinBalanceBefore|beinBalanceAfter):[^\n]*\|\| undefined/
    );
});

test('does not treat generic pre-payment success text as direct purchase completion', () => {
    const source = readFileSync(join(process.cwd(), 'worker', 'src', 'http', 'HttpClientService.ts'), 'utf8');

    assert.doesNotMatch(
        source,
        /pageText\.includes\('Contract Created Successfully'\)\s*\|\|\s*pageText\.includes\('Success'\)/
    );
    assert.match(source, /pageText\.includes\('Package Added Successfully'\)/);
    assert.match(source, /Direct success text before Pay could not be verified by balance delta/);
    assert.match(source, /balanceDecreaseMatchesExpected\(directDecrease, expectedCost\)/);
});

test('delays success-message balance verification for three fallback checks', () => {
    const source = readFileSync(join(process.cwd(), 'worker', 'src', 'http', 'HttpClientService.ts'), 'utf8');

    assert.match(source, /const successFallbackChecks = getFinalPayBalanceCheckCount\('fallback'\)/);
    assert.match(source, /await wait\(getFinalPayBalanceDelayMs\('fallback'\)\)/);
    assert.match(source, /Success message delayed balance check/);
    assert.match(source, /could not verify expected balance debit after delayed checks/);
    assert.match(source, /outcomeCategory: 'UNCERTAIN_REVIEW_REQUIRED'/);
});

test('reads balance from final pay result page before fallback balance checks', () => {
    const source = readFileSync(join(process.cwd(), 'worker', 'src', 'http', 'HttpClientService.ts'), 'utf8');

    assert.match(source, /const resultPageBalanceAfter = this\.extractDealerBalanceFromHtml\(res\.data\)/);
    assert.match(source, /resultPageBalanceAfter === null \? 'final_pay_balance_check' : 'final_pay_result_page'/);
    assert.match(source, /beinBalanceAfterSource: successVerification\.beinBalanceAfter === null \? 'missing' : successBalanceAfterSource/);
});

test('parses package prices with arbitrary decimal precision', () => {
    const source = readFileSync(join(process.cwd(), 'worker', 'src', 'http', 'HttpClientService.ts'), 'utf8');

    assert.ok(source.includes("const priceMatch = rowText.match(/(?:^|[^\\d.])([\\d,]+(?:\\.\\d+)?)\\s*USD/i);"));
    assert.doesNotMatch(source, /const priceMatch = rowText\.match\(\/\(\[\\d,\]\+\(\?:\\\.\\d\{1,2\}\)\?\)\\s\*USD\/i\)/);
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
