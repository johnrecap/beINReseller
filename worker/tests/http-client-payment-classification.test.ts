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
import { mapProviderPaymentState } from '../../shared/operations/renewal-fulfillment';
import * as cheerio from 'cheerio';
import { HttpClientService } from '../src/http/HttpClientService';
import type { AvailablePackage } from '../src/http/types';

test('classifies explicit success with matching balance delta as confirmed success', () => {
    assert.equal(
        classifyFinalPay({
            success: true,
            beinBalanceAfter: balanceAfterDecrease(FINAL_PAY_EXPECTED_COST),
        }),
        'CONFIRMED_SUCCESS'
    );
});

test('does not infer a no-charge result from explicit success with unchanged balance', () => {
    assert.equal(
        classifyFinalPay({
            success: true,
            message: 'Contract Created Successfully',
            beinBalanceAfter: FINAL_PAY_BALANCE_BEFORE,
        }),
        'UNCERTAIN_REVIEW_REQUIRED'
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

test('maps matching balance delta to CHARGED evidence without treating it as fulfillment', () => {
    const financialOutcome = classifyFinalPay({
            message: 'Server Error',
            beinBalanceAfter: balanceAfterDecrease(FINAL_PAY_EXPECTED_COST),
        });

    assert.equal(financialOutcome, 'CONFIRMED_SUCCESS');
    assert.equal(mapProviderPaymentState(financialOutcome, true), 'CHARGED');
});

test('maps a balance debit down to zero to CHARGED evidence only', () => {
    const financialOutcome = classifyFinalPay({
            expectedCost: FINAL_PAY_BALANCE_BEFORE,
            beinBalanceAfter: 0,
        });

    assert.equal(financialOutcome, 'CONFIRMED_SUCCESS');
    assert.equal(mapProviderPaymentState(financialOutcome, true), 'CHARGED');
});

test('maps an exact fractional balance debit to CHARGED evidence only', () => {
    const financialOutcome = classifyFinalPay({
            expectedCost: 150,
            beinBalanceBefore: 4785.995,
            beinBalanceAfter: 4635.995,
        });

    assert.equal(financialOutcome, 'CONFIRMED_SUCCESS');
    assert.equal(mapProviderPaymentState(financialOutcome, true), 'CHARGED');
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
    const client = Object.create(HttpClientService.prototype) as {
        extractPackagesFromHtml: ($: cheerio.CheerioAPI) => AvailablePackage[];
    };
    for (const [text, expected] of [['86.4000', 86.4], ['174.1234', 174.1234], ['1,200.50', 1200.5]] as const) {
        const parsed = client.extractPackagesFromHtml(cheerio.load(`<table id="ContentPlaceHolder1_gvAvailablePackages">
            <tr><td><input type="checkbox" name="current-row"></td><td><span id="pkg_lblName">Premium 6 Months</span></td>
            <td>${text} USD</td></tr></table>`));
        assert.equal(parsed.length, 1);
        assert.equal(parsed[0].price, expected);
    }
});

test('keeps unchanged balance after final pay uncertain without explicit rejection', () => {
    assert.equal(
        classifyFinalPay({
            message: 'No success confirmation found from beIN',
            beinBalanceAfter: FINAL_PAY_BALANCE_BEFORE,
        }),
        'UNCERTAIN_REVIEW_REQUIRED'
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

test('accepts an explicit provider insufficient-credit rejection as not charged', () => {
    assert.equal(
        classifyFinalPay({
            success: false,
            message: 'Insufficient credit',
            beinBalanceAfter: FINAL_PAY_BALANCE_BEFORE,
        }),
        'CONFIRMED_NOT_CHARGED'
    );
});

test('classifies delayed expected balance decrease as confirmed success', () => {
    assert.equal(classifyFinalPayReadings(delayedExpectedDecreaseReadings, 3), 'CONFIRMED_SUCCESS');
});

test('does not treat first unchanged delayed balance read as confirmed no-charge', () => {
    assert.equal(classifyFinalPayReadings([FINAL_PAY_BALANCE_BEFORE], 3), 'UNCERTAIN_REVIEW_REQUIRED');
});

test('keeps unchanged balance after all delayed checks uncertain without explicit rejection', () => {
    assert.equal(classifyFinalPayReadings(unchangedFinalPayReadings, 3), 'UNCERTAIN_REVIEW_REQUIRED');
});

test('classifies delayed mismatched balance decrease as review required', () => {
    assert.equal(classifyFinalPayReadings(delayedMismatchedDecreaseReadings, 3), 'UNCERTAIN_REVIEW_REQUIRED');
});

test('classifies unreadable delayed balance checks as review required', () => {
    assert.equal(classifyFinalPayReadings(unreadableFinalPayReadings, 3), 'UNCERTAIN_REVIEW_REQUIRED');
});
