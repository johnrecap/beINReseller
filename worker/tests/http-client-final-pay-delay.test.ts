import test from 'node:test';
import assert from 'node:assert/strict';
import {
    FINAL_PAY_BUSY_RETRY_DELAY_MS,
    FINAL_PAY_FALLBACK_BALANCE_DELAY_MS,
    getFinalPayBalanceDelayMs,
} from '../src/http/HttpClientService';

test('waits 3 seconds before fallback balance verification after final pay', () => {
    assert.equal(FINAL_PAY_FALLBACK_BALANCE_DELAY_MS, 3000);
    assert.equal(getFinalPayBalanceDelayMs('fallback'), 3000);
});

test('keeps busy retry balance delay at one 3-second interval', () => {
    assert.equal(FINAL_PAY_BUSY_RETRY_DELAY_MS, 3000);
    assert.equal(getFinalPayBalanceDelayMs('busy-retry'), 3000);
});
