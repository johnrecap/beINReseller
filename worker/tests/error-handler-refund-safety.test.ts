import test from 'node:test';
import assert from 'node:assert/strict';
import { decideWorkerRefundSafety } from '../src/utils/error-handler';

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
