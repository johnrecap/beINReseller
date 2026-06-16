import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('post-Pay contract verification waits and records every retry attempt', () => {
    const source = readFileSync(join(process.cwd(), 'worker', 'src', 'http-queue-processor.ts'), 'utf8');

    assert.match(source, /attempt <= RENEWAL_CONTRACT_VERIFICATION_ATTEMPTS/);
    assert.match(source, /await delay\(RENEWAL_CONTRACT_VERIFICATION_DELAY_MS\)/);
    assert.match(source, /attempts\.push\(verification\)/);
    assert.match(source, /mergeContractVerificationEvidence\(postPayResponseData, contractVerificationRun, 'post_final_pay'\)/);
    assert.match(source, /mergeContractVerificationEvidence\(operation\.responseData, verificationRun, 'admin_live_check'\)/);
});
