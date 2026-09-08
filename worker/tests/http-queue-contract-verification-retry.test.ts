import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('post-mutation retries use composite verification-only orchestration and never purchase again', () => {
    const source = readFileSync(join(process.cwd(), 'worker', 'src', 'http-queue-processor.ts'), 'utf8');
    const start = source.indexOf('async function handleVerifyRenewalFulfillmentHttp(');
    const end = source.indexOf('/**\n * VERIFY_REVIEW_CARD', start);
    assert.ok(start >= 0 && end > start);
    const verificationOnlyHandler = source.slice(start, end);

    assert.match(verificationOnlyHandler, /verifyRenewalFulfillmentWithProvider/);
    assert.match(verificationOnlyHandler, /recordFulfillmentVerificationAttempt/);
    assert.match(verificationOnlyHandler, /scheduleRenewalFulfillmentVerification/);
    assert.match(verificationOnlyHandler, /SOLD_REPORT_CONTRACT_CORRELATION/);
    assert.doesNotMatch(verificationOnlyHandler, /confirmPurchase|attemptPurchaseWithAccount|loadPackages|applyPromo/);
});
