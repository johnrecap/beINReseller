import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    RetryableRenewalVerificationError,
    isTransientRenewalVerificationError,
} from '../src/lib/renewal-verification-retry';

test('verify-only infrastructure failures are classified for Bull retry', () => {
    for (const message of [
        'PROVIDER_ACCOUNT_EXECUTION_UNAVAILABLE',
        'FULFILLMENT_READ_SESSION_UNAVAILABLE',
        'PROVIDER_EXECUTION_LEASE_LOST_DURING_RELOGIN',
        'PROVIDER_EXECUTION_LEASE_LOST_ASSERT_FAILED',
    ]) {
        assert.equal(isTransientRenewalVerificationError(new Error(message)), true, message);
    }
});

test('proof conflicts and evidence failures are never classified as infrastructure retries', () => {
    for (const message of [
        'FULFILLMENT_VERIFICATION_ATTEMPT_REPLAY_MISMATCH',
        'DATABASE_PROOF_CLAIM_CONFLICT',
        'VALID_NO_MATCH',
        'PROOF_CONFLICT',
    ]) {
        assert.equal(isTransientRenewalVerificationError(new Error(message)), false, message);
    }
});

test('retry wrapper preserves the original failure without resembling provider mutation work', () => {
    const original = new Error('FULFILLMENT_READ_SESSION_UNAVAILABLE');
    const wrapped = new RetryableRenewalVerificationError(original);

    assert.equal(wrapped.cause, original);
    assert.match(wrapped.message, /FULFILLMENT_READ_SESSION_UNAVAILABLE/);
    assert.doesNotMatch(wrapped.message, /CONFIRM_PURCHASE|FINAL_PAY|PAY_REQUEST/);
});

test('all verification job failures bypass generic renewal refund handling', () => {
    const source = readFileSync(
        join(process.cwd(), 'worker/src/http-queue-processor.ts'),
        'utf8'
    );
    const catchStart = source.indexOf('} catch (error: unknown) {', source.indexOf('export async function processOperationHttp'));
    const databaseRead = source.indexOf('// ALWAYS read from DB', catchStart);
    const catchPrefix = source.slice(catchStart, databaseRead);

    assert.match(catchPrefix, /type === 'VERIFY_RENEWAL_FULFILLMENT'/);
    assert.match(catchPrefix, /type === 'VERIFY_REVIEW_CARD'/);
    assert.match(catchPrefix, /throw error/);
    assert.doesNotMatch(catchPrefix, /refundUser|finalizeRenewalNoChargeFailure|markOperationFailed/);
});
