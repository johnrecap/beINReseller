import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'worker', 'src', 'http-queue-processor.ts'), 'utf8');

test('START_RENEWAL does not share one HttpClientService across card and package flows concurrently', () => {
    const branchStart = source.indexOf('No STB cache: read the STB first');
    const branchEnd = source.indexOf('if (!packagesResult.success)', branchStart);

    assert.notEqual(branchStart, -1);
    assert.notEqual(branchEnd, -1);

    const noCacheBranch = source.slice(branchStart, branchEnd);

    assert.doesNotMatch(noCacheBranch, /Promise\.all\([\s\S]*client\.checkCard[\s\S]*client\.loadPackages/);
    assert.doesNotMatch(noCacheBranch, /Running checkCard \+ loadPackages in PARALLEL/);

    const checkIndex = noCacheBranch.indexOf('client.checkCard(cardNumber)');
    const loadIndex = noCacheBranch.indexOf('client.loadPackages(cardNumber');

    assert.ok(checkIndex >= 0);
    assert.ok(loadIndex > checkIndex);
});

test('balance-only and legacy contract-only evidence cannot promote an automated review to completed', () => {
    assert.doesNotMatch(source, /function completeConfirmedRenewalOperation/);
    assert.doesNotMatch(source, /promoted automated review to COMPLETED/);
    assert.match(source, /verifyRenewalFulfillmentWithProvider/);
    assert.match(source, /SOLD_REPORT_CONTRACT_CORRELATION/);
    assert.match(source, /LEGACY_CONTRACT_ONLY/);
    assert.match(source, /fulfillmentProofMode/);
});

test('final provider mutation barrier blocks duplicate OK and Pay submission', () => {
    assert.match(source, /FINAL_PROVIDER_MUTATION_STARTED/);
    assert.match(source, /FINAL_PAY_REQUEST_STARTED/);
    assert.match(source, /reason: 'final_provider_mutation_already_started'/);
    assert.match(source, /claimFinalProviderMutationStart/);
    assert.match(source, /verificationOnly/);
    assert.doesNotMatch(source, /FINAL_PROVIDER_MUTATION_STARTED[\s\S]{0,800}client\.confirmPurchase\(/);
});

test('confirmed provider charge persists ledger and audit then reviews without fulfillment proof', () => {
    const branchStart = source.indexOf("if (providerPaymentState === 'CHARGED') {", source.indexOf('async function handleConfirmPurchaseHttp'));
    const branchEnd = source.indexOf("} else if (terminalDecision.decision === 'REVIEW_REQUIRED')", branchStart);

    assert.notEqual(branchStart, -1);
    assert.notEqual(branchEnd, -1);

    const successBranch = source.slice(branchStart, branchEnd);
    const ledgerIndex = successBranch.indexOf('recordConfirmedBeinSpend({');
    const auditIndex = successBranch.indexOf('mergeOperationAuditSnapshot(postPayResponseData, auditSnapshot)');

    assert.ok(ledgerIndex >= 0);
    assert.ok(auditIndex > ledgerIndex);
    assert.match(successBranch, /ledgerResultBlocksCompletion\(ledgerResult\)/);
    assert.match(successBranch, /status: 'REVIEW_REQUIRED'/);
    assert.match(successBranch, /responseData: postPayResponseData/);
    assert.match(successBranch, /PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED/);
    assert.doesNotMatch(successBranch, /status: 'COMPLETED'/);
    assert.doesNotMatch(successBranch, /awardCompletedOperationPointsSafely/);
});

test('legacy direct purchase success is reviewed instead of completed without final-pay proof', () => {
    const directStart = source.indexOf("// Direct success (shouldn't happen with skipFinalClick=true)");
    const directEnd = source.indexOf('// Purchase failed', directStart);

    assert.notEqual(directStart, -1);
    assert.notEqual(directEnd, -1);

    const directBranch = source.slice(directStart, directEnd);
    assert.match(directBranch, /operationPhase: 'POST_FINAL_PAY_REVIEW'/);
    assert.match(directBranch, /status: 'REVIEW_REQUIRED'/);
    assert.doesNotMatch(directBranch, /status: 'COMPLETED'/);
    assert.doesNotMatch(directBranch, /awardCompletedOperationPointsSafely/);
});

test('installment HTTP result records debit independently and delegates unknown settlement to the finalizer', () => {
    const branchStart = source.indexOf('// The legacy HTTP adapter exposes debit evidence');
    const branchEnd = source.indexOf('installmentLeaseHeartbeat.stop()', branchStart);

    assert.notEqual(branchStart, -1);
    assert.notEqual(branchEnd, -1);

    const successBranch = source.slice(branchStart, branchEnd);
    const ledgerIndex = successBranch.indexOf('recordConfirmedBeinSpend({');
    const evidenceIndex = successBranch.indexOf('prisma.operationInstallmentEvidence.updateMany(');
    const observationIndex = successBranch.indexOf("'INSTALLMENT_OBSERVATION'");
    const finalizerIndex = successBranch.indexOf('finalizeInstallmentSettlement(');

    assert.ok(ledgerIndex >= 0);
    assert.ok(evidenceIndex > ledgerIndex);
    assert.ok(observationIndex > evidenceIndex);
    assert.ok(finalizerIndex > observationIndex);
    assert.match(successBranch, /settlementState: 'UNKNOWN'/);
    assert.match(successBranch, /ATTRIBUTABLE_INSTALLMENT_SETTLEMENT_REQUIRED/);
    assert.match(successBranch, /expectedCorrelationKey: mutationClaim.correlationKey/);
    assert.doesNotMatch(successBranch, /settlementState: 'SETTLED'|status: 'COMPLETED'|awardCompletedOperationPointsSafely/);
});
