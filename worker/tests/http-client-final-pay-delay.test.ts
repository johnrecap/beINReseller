import test from 'node:test';
import assert from 'node:assert/strict';
import {
    FINAL_PAY_BUSY_RETRY_DELAY_MS,
    FINAL_PAY_FALLBACK_BALANCE_CHECKS,
    FINAL_PAY_FALLBACK_BALANCE_DELAY_MS,
    getFinalPayBalanceCheckCount,
    getFinalPayBalanceDelayMs,
} from '../src/http/HttpClientService';

test('waits 3 seconds before fallback balance verification after final pay', () => {
    assert.equal(FINAL_PAY_FALLBACK_BALANCE_DELAY_MS, 3000);
    assert.equal(getFinalPayBalanceDelayMs('fallback'), 3000);
    assert.equal(FINAL_PAY_FALLBACK_BALANCE_CHECKS, 3);
    assert.equal(getFinalPayBalanceCheckCount('fallback'), 3);
});

test('keeps busy retry balance delay at one 3-second interval', () => {
    assert.equal(FINAL_PAY_BUSY_RETRY_DELAY_MS, 3000);
    assert.equal(getFinalPayBalanceDelayMs('busy-retry'), 3000);
    assert.equal(getFinalPayBalanceCheckCount('busy-retry'), 5);
});
