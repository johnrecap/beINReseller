import test from 'node:test';
import assert from 'node:assert/strict';
import { decideWorkerRefundSafety } from '../src/utils/error-handler';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('worker refund safety treats dispatch pending as before final Pay', () => {
    const decision = decideWorkerRefundSafety({
        status: 'COMPLETING',
        amount: 92,
        responseData: {
            operationPhase: 'DISPATCH_PENDING',
            finalPaySubmitted: false,
        },
        existingRefund: false,
    });

    assert.equal(decision.finalPayMayHaveStarted, false);
    assert.equal(decision.refundAllowed, true);
    assert.equal(decision.reason, 'pre_final_payment');
});

test('worker refund safety blocks ambiguous final Pay submissions', () => {
    const decision = decideWorkerRefundSafety({
        status: 'COMPLETING',
        amount: 92,
        responseData: {
            operationPhase: 'FINAL_PAY_SUBMITTED',
            finalPaySubmitted: true,
        },
        existingRefund: false,
    });

    assert.equal(decision.finalPayMayHaveStarted, true);
    assert.equal(decision.refundAllowed, false);
    assert.equal(decision.reason, 'final_pay_may_have_started');
});

test('worker refund safety treats final Pay request-started as after final Pay', () => {
    const decision = decideWorkerRefundSafety({
        status: 'PROCESSING',
        amount: 92,
        responseData: {
            operationPhase: 'FINAL_PAY_REQUEST_STARTED',
            finalPaySubmitted: false,
        },
        existingRefund: false,
    });

    assert.equal(decision.finalPayMayHaveStarted, true);
    assert.equal(decision.refundAllowed, false);
    assert.equal(decision.reason, 'final_pay_may_have_started');
});

test('renewal ignores the legacy final-pay refund bypass without typed no-charge and valid no-match', () => {
    const decision = decideWorkerRefundSafety({
        status: 'PROCESSING',
        amount: 92,
        responseData: { operationPhase: 'FINAL_PROVIDER_MUTATION_STARTED' },
        existingRefund: false,
        operationType: 'RENEW',
        providerMutationStartedAt: new Date('2026-08-24T12:00:00.000Z'),
        allowFinalPayRefund: true,
    });

    assert.equal(decision.refundAllowed, false);
    assert.equal(decision.reason, 'final_pay_may_have_started');
});

test('renewal post-mutation refund requires typed not-charged plus valid no-match', () => {
    const decision = decideWorkerRefundSafety({
        status: 'PROCESSING',
        amount: 92,
        responseData: { operationPhase: 'FINAL_PROVIDER_MUTATION_STARTED' },
        existingRefund: false,
        operationType: 'RENEW',
        providerMutationStartedAt: new Date('2026-08-24T12:00:00.000Z'),
        providerPaymentState: 'NOT_CHARGED',
        fulfillmentState: 'NOT_FOUND',
        fulfillmentVerificationOutcome: 'VALID_NO_MATCH',
    });

    assert.equal(decision.refundAllowed, true);
    assert.equal(decision.reason, 'confirmed_not_charged_after_final_pay');
});

test('renewal refunds use the canonical deduction ledger rather than operation amount', () => {
    const source = readFileSync(join(process.cwd(), 'worker', 'src', 'utils', 'error-handler.ts'), 'utf8');

    assert.match(source, /type: 'OPERATION_DEDUCT'/);
    assert.match(source, /canonicalRefundAmount/);
    assert.match(source, /operation\.userId !== userId/);
    assert.doesNotMatch(source, /increment: amount/);
});

test('terminal no-charge failure, refund, point reversal, and reservation release are atomic', () => {
    const processor = readFileSync(join(process.cwd(), 'worker', 'src', 'http-queue-processor.ts'), 'utf8');
    const finalizer = readFileSync(
        join(process.cwd(), 'worker', 'src', 'lib', 'renewal-no-charge-finalization.ts'),
        'utf8'
    );

    assert.match(processor, /finalizeRenewalNoChargeFailure/);
    assert.doesNotMatch(
        processor,
        /status: 'FAILED',[\s\S]{0,500}refundUser\([\s\S]{0,300}NOT_CHARGED_VALID_NO_MATCH/
    );
    assert.match(finalizer, /db\.\$transaction/);
    assert.match(finalizer, /lockFinancialOperation\(tx, input\.operationId\)/);
    assert.match(readFileSync(join(process.cwd(), 'shared/operations/financial-lock.ts'), 'utf8'), /SELECT "id" FROM "operations"[\s\S]*FOR UPDATE/);
    assert.match(finalizer, /type: \{ in: \['OPERATION_DEDUCT', 'REFUND'\] \}/);
    assert.match(finalizer, /pointLedgerEntry\.createMany/);
    assert.match(finalizer, /operationIntegrityIssue\.updateMany/);
    assert.match(finalizer, /cardLifecycleReservation\.updateMany/);
    assert.match(finalizer, /providerAccountCausalReservation\.updateMany/);
});

test('generic post-mutation renewal catch delegates atomically and cannot refund then fail separately', () => {
    const worker = readFileSync(join(process.cwd(), 'worker', 'src', 'http-queue-processor.ts'), 'utf8');
    const catchStart = worker.indexOf('} catch (error: unknown) {');
    const finallyStart = worker.indexOf('} finally {', catchStart);
    assert.ok(catchStart >= 0 && finallyStart > catchStart);
    const genericCatch = worker.slice(catchStart, finallyStart);
    const renewalGuard = genericCatch.indexOf("op.type === 'RENEW' && finalPayStarted");
    const atomicFinalizer = genericCatch.indexOf('finalizeRenewalNoChargeFailure', renewalGuard);
    const branchReturn = genericCatch.indexOf('return;', atomicFinalizer);
    const genericRefund = genericCatch.indexOf('await refundUser(', branchReturn);
    const genericFailure = genericCatch.indexOf('await markOperationFailed(', genericRefund);

    assert.ok(renewalGuard >= 0);
    assert.ok(renewalGuard < atomicFinalizer);
    assert.ok(atomicFinalizer < branchReturn);
    assert.ok(branchReturn < genericRefund);
    assert.ok(genericRefund < genericFailure);
    assert.doesNotMatch(
        genericCatch.slice(renewalGuard, branchReturn),
        /await refundUser\(|await markOperationFailed\(|releaseSafeTerminalReservations/,
    );
});

test('pre-mutation renewal timeout, generic failure, and cancellation share one atomic settlement finalizer', () => {
    const worker = readFileSync(join(process.cwd(), 'worker', 'src', 'http-queue-processor.ts'), 'utf8');
    const finalizer = readFileSync(
        join(process.cwd(), 'worker', 'src', 'lib', 'pre-mutation-renewal-finalization.ts'),
        'utf8'
    );

    assert.ok((worker.match(/finalizePreMutationRenewalTermination\(/g) || []).length >= 3);
    assert.match(finalizer, /prisma\.\$transaction/);
    assert.match(finalizer, /SELECT "id" FROM "operations"[\s\S]*FOR UPDATE/);
    assert.match(finalizer, /CANONICAL_SETTLEMENT_REQUIRED/);
    assert.match(finalizer, /tx\.user\.update[\s\S]*tx\.transaction\.create/);
    assert.match(finalizer, /tx\.operation\.updateMany/);
    const closure = readFileSync(join(process.cwd(), 'shared', 'operations', 'renewal-pre-payment.ts'), 'utf8');
    assert.match(finalizer, /closePrePaymentHolds/);
    assert.match(closure, /cardLifecycleReservation\.updateMany/);
    assert.match(closure, /providerAccountCausalReservation\.updateMany/);

    const cancellationStart = worker.indexOf('async function handleCancelConfirmHttp')
    const cancellationEnd = worker.indexOf('async function handleSignalRefreshHttp', cancellationStart)
    const cancellation = worker.slice(cancellationStart, cancellationEnd)
    const atomicTermination = cancellation.indexOf('finalizePreMutationRenewalTermination(')
    assert.ok(atomicTermination >= 0);
    assert.doesNotMatch(cancellation.slice(atomicTermination), /await refundUser\(|releaseSafeTerminalReservations/);
});
