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

test('confirmed provider success can repair automated review without overriding manual review', () => {
    assert.match(source, /function hasManualFinancialReviewDecision/);
    assert.match(source, /function confirmedProviderContextMatches/);
    assert.match(source, /function completeConfirmedRenewalOperation/);

    const helperStart = source.indexOf('async function completeConfirmedRenewalOperation');
    const helperEnd = source.indexOf('function getErrMsg', helperStart);

    assert.notEqual(helperStart, -1);
    assert.notEqual(helperEnd, -1);

    const helperSource = source.slice(helperStart, helperEnd);

    assert.match(helperSource, /current\?\.status !== OperationStatus\.REVIEW_REQUIRED/);
    assert.match(helperSource, /hasFinalPaymentStarted\(current\.status, current\.responseData\)/);
    assert.match(helperSource, /hasManualFinancialReviewDecision\(current\.responseData\)/);
    assert.match(helperSource, /confirmedProviderContextMatches\(current\.responseData, finalPayEvidence\)/);
    assert.match(helperSource, /shouldRecordConfirmedProviderSpend\(finalPayEvidence\)/);
    assert.match(helperSource, /prisma\.transaction\.findFirst/);
    assert.match(helperSource, /type: 'REFUND'/);
    assert.match(helperSource, /status: OperationStatus\.REVIEW_REQUIRED/);
    assert.match(helperSource, /updatedAt: current\.updatedAt/);
});

test('final pay request-started evidence blocks duplicate provider submission', () => {
    assert.match(source, /phase === 'FINAL_PAY_REQUEST_STARTED'/);
    assert.match(source, /reason: 'final_pay_already_started'/);
    assert.match(source, /operationPhase: 'FINAL_PAY_REQUEST_STARTED'/);
    assert.match(source, /shouldReclassifyConservativeNoCharge/);
    assert.doesNotMatch(source, /operationPhase: 'FINAL_PAY_SUBMITTED',\s*jobType: 'CONFIRM_PURCHASE',\s*finalPaySubmitted: true,\s*finalPaySubmittedAt: new Date\(\)\.toISOString\(\),\s*dealerBalanceBefore: preFinalBeinBalance/s);
});

test('confirmed renewal persists ledger and audit evidence before final completion', () => {
    const branchStart = source.indexOf('if (result.success) {', source.indexOf('async function handleConfirmPurchaseHttp'));
    const branchEnd = source.indexOf('} else if (outcomeDecision.reviewRequired', branchStart);

    assert.notEqual(branchStart, -1);
    assert.notEqual(branchEnd, -1);

    const successBranch = source.slice(branchStart, branchEnd);
    const ledgerIndex = successBranch.indexOf('recordConfirmedBeinSpend({');
    const auditIndex = successBranch.indexOf('mergeOperationAuditSnapshot(postPayResponseData, auditSnapshot)');
    const completeIndex = successBranch.indexOf('completeConfirmedRenewalOperation(operationId');

    assert.ok(ledgerIndex >= 0);
    assert.ok(auditIndex > ledgerIndex);
    assert.ok(completeIndex > auditIndex);
    assert.match(successBranch, /ledgerResultBlocksCompletion\(ledgerResult\)/);
    assert.match(successBranch, /status: 'REVIEW_REQUIRED'/);
    assert.match(successBranch, /responseData: postPayResponseData/);
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

test('confirmed installment persists ledger and audit before final completion', () => {
    const branchStart = source.indexOf('if (payResult.success) {');
    const branchEnd = source.indexOf('if (payOutcomeDecision.reviewRequired', branchStart);

    assert.notEqual(branchStart, -1);
    assert.notEqual(branchEnd, -1);

    const successBranch = source.slice(branchStart, branchEnd);
    const ledgerIndex = successBranch.indexOf('recordConfirmedBeinSpend({');
    const auditIndex = successBranch.indexOf('mergeOperationAuditSnapshot(installmentPostPayResponseData, auditSnapshot)');
    const completeIndex = successBranch.indexOf("status: 'COMPLETED'");

    assert.ok(ledgerIndex >= 0);
    assert.ok(auditIndex > ledgerIndex);
    assert.ok(completeIndex > auditIndex);
    assert.match(successBranch, /ledgerResultBlocksCompletion\(ledgerResult\)/);
    assert.match(successBranch, /status: 'REVIEW_REQUIRED'/);
    assert.match(successBranch, /responseData: installmentCompletedResponseData/);
});
