import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decideRenewalRefundSafety } from '../../src/lib/renewal-payment-refund-finalization'

type SafetyInput = Parameters<typeof decideRenewalRefundSafety>[0]

function safeInput(overrides: Partial<SafetyInput> = {}): SafetyInput {
    return {
        exactProviderAndLocalLink: true,
        fullProviderRefund: true,
        reservationOwned: true,
        operationStatus: 'COMPLETING',
        subscriptionStatus: 'PAID',
        source: 'store_renewal' as const,
        paymentStatus: 'SUCCEEDED',
        providerMutationStarted: false,
        providerPaymentState: 'NOT_SUBMITTED',
        fulfillmentState: 'UNVERIFIED',
        fulfillmentAuthority: 'NONE',
        fulfillmentProofExists: false,
        chargedProviderLedgerExists: false,
        dispatchState: 'PENDING_UNCLAIMED' as const,
        refundLedgerExists: false,
        ...overrides,
    }
}

test('full store refund is automatic only before provider work and queue claim', () => {
    assert.equal(decideRenewalRefundSafety(safeInput()), 'SAFE_REFUND')
    assert.equal(decideRenewalRefundSafety(safeInput({
        operationStatus: 'AWAITING_PACKAGE',
        subscriptionStatus: 'AWAITING_PAYMENT',
        dispatchState: 'MISSING',
    })), 'SAFE_REFUND')
})

test('full mobile renewal refund uses the same pre-provider safety boundary', () => {
    assert.equal(decideRenewalRefundSafety(safeInput({
        source: 'mobile_renewal',
        subscriptionStatus: null,
        operationStatus: 'AWAITING_FINAL_CONFIRM',
        dispatchState: 'MISSING',
    })), 'SAFE_REFUND')
})

test('partial, claimed, mutated, conflicting, and terminal refunds require review', () => {
    for (const candidate of [
        safeInput({ fullProviderRefund: false }),
        safeInput({ dispatchState: 'CLAIMED_OR_SENT' }),
        safeInput({ providerMutationStarted: true }),
        safeInput({ providerPaymentState: 'CHARGED' }),
        safeInput({ fulfillmentProofExists: true }),
        safeInput({ exactProviderAndLocalLink: false }),
        safeInput({ operationStatus: 'COMPLETED', subscriptionStatus: 'COMPLETED' }),
        safeInput({ refundLedgerExists: true }),
    ]) {
        assert.equal(decideRenewalRefundSafety(candidate), 'REVIEW_REQUIRED')
    }
})

test('an exact already-refunded terminal state is an idempotent replay', () => {
    assert.equal(decideRenewalRefundSafety(safeInput({
        paymentStatus: 'REFUNDED',
        operationStatus: 'CANCELLED',
        subscriptionStatus: 'REFUNDED',
        dispatchState: 'STOPPED',
        refundLedgerExists: true,
    })), 'REPLAY')
})

test('renewal refund webhook uses one atomic finalizer for store and mobile sources', () => {
    const route = readFileSync(
        join(process.cwd(), 'src', 'app', 'api', 'store', 'webhooks', 'stripe', 'route.ts'),
        'utf8'
    )
    const finalizer = readFileSync(
        join(process.cwd(), 'src', 'lib', 'renewal-payment-refund-finalization.ts'),
        'utf8'
    )
    const dispatch = readFileSync(
        join(process.cwd(), 'src', 'lib', 'operation-dispatch.ts'),
        'utf8'
    )

    assert.match(route, /finalizeRenewalPaymentRefund\(tx/)
    assert.match(route, /stripe\.paymentIntents\.retrieve\(paymentIntentId\)/)
    assert.doesNotMatch(route, /payment\.subscription && isFullRefund[\s\S]*storeSubscription\.update/)
    assert.match(finalizer, /SELECT id FROM "operations"[\s\S]*FOR UPDATE/)
    assert.match(finalizer, /SELECT id FROM "payments"[\s\S]*FOR UPDATE/)
    assert.match(finalizer, /SELECT id FROM "store_subscriptions"[\s\S]*FOR UPDATE/)
    assert.match(finalizer, /SELECT id FROM "customers"[\s\S]*FOR UPDATE/)
    assert.match(finalizer, /lockRenewalCardLifecycle\(tx, operationHint\.cardNumber\)/)
    assert.match(finalizer, /providerAccountCausalReservation\.updateMany/)
    assert.match(finalizer, /holdProviderAccountReservationForReview/)
    assert.match(finalizer, /jobType: \{ in: \['COMPLETE_PURCHASE', 'CONFIRM_PURCHASE'\] \}/)
    assert.match(finalizer, /entryType: 'REFUND'/)
    assert.match(finalizer, /status: 'REVIEW_REQUIRED'/)
    assert.match(finalizer, /STRIPE_RENEWAL_REFUND_CONFLICT/)
    assert.match(dispatch, /status: 'DISPATCHING'/)
    assert.match(dispatch, /status: 'PENDING',[\s\S]*attempts: \{ lt: maxAttempts \}/)
})
