import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFinalPayOutcome } from '../src/http/HttpClientService';

test('classifies explicit success as confirmed success', () => {
    assert.equal(
        classifyFinalPayOutcome({
            success: true,
            finalPaySubmitted: true,
            expectedCost: 92,
            beinBalanceBefore: 500,
            beinBalanceAfter: 408,
        }),
        'CONFIRMED_SUCCESS'
    );
});

test('classifies matching balance delta as confirmed success', () => {
    assert.equal(
        classifyFinalPayOutcome({
            success: false,
            message: 'Server Error',
            finalPaySubmitted: true,
            expectedCost: 92,
            beinBalanceBefore: 500,
            beinBalanceAfter: 408,
        }),
        'CONFIRMED_SUCCESS'
    );
});

test('classifies unchanged balance after final pay as not charged', () => {
    assert.equal(
        classifyFinalPayOutcome({
            success: false,
            message: 'No success confirmation found from beIN',
            finalPaySubmitted: true,
            expectedCost: 92,
            beinBalanceBefore: 500,
            beinBalanceAfter: 500,
        }),
        'CONFIRMED_NOT_CHARGED'
    );
});

test('classifies mismatched balance delta as review required', () => {
    assert.equal(
        classifyFinalPayOutcome({
            success: false,
            message: 'Server Error',
            finalPaySubmitted: true,
            expectedCost: 92,
            beinBalanceBefore: 500,
            beinBalanceAfter: 450,
        }),
        'UNCERTAIN_REVIEW_REQUIRED'
    );
});

test('classifies missing balance evidence after pay submit as review required', () => {
    assert.equal(
        classifyFinalPayOutcome({
            success: false,
            message: 'Server Error',
            finalPaySubmitted: true,
            expectedCost: 92,
        }),
        'UNCERTAIN_REVIEW_REQUIRED'
    );
});
