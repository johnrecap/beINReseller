import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    RENEWAL_CREATION_BLOCKED_CODE,
    RENEWAL_LEGACY_ROUTE_DISABLED_CODE,
    decideStoreRenewalCancellationSafety,
    normalizeRenewalCardNumber,
} from '../../src/lib/operations/renewal-creation-guard'

function routeSource(...parts: string[]): string {
    return readFileSync(join(process.cwd(), 'src', 'app', 'api', ...parts, 'route.ts'), 'utf8')
}

test('renewal guard exposes stable machine-readable failure codes', () => {
    assert.equal(RENEWAL_CREATION_BLOCKED_CODE, 'RENEWAL_FULFILLMENT_REVIEW_PENDING')
    assert.equal(RENEWAL_LEGACY_ROUTE_DISABLED_CODE, 'RENEWAL_ROUTE_MIGRATION_REQUIRED')
    assert.equal(normalizeRenewalCardNumber(' 7517 687161 '), '7517687161')
    assert.throws(() => normalizeRenewalCardNumber('7517-x'))
})

test('store cancellation is safe only before payment, mutation, proof, or integrity evidence', () => {
    const safeInput = {
        subscriptionStatus: 'AWAITING_PACKAGE',
        operationStatus: 'AWAITING_PACKAGE',
        stripePaymentIntentId: null,
        paymentId: null,
        providerPaymentState: 'NOT_SUBMITTED',
        providerMutationStartedAt: null,
        fulfillmentAuthority: 'NONE',
        fulfillmentProofExists: false,
        unresolvedIntegrityIssueExists: false,
        storeCreditDebitExists: false,
    }
    assert.deepEqual(decideStoreRenewalCancellationSafety(safeInput), { action: 'CANCEL_SAFE' })

    for (const unsafe of [
        { subscriptionStatus: 'AWAITING_PAYMENT' },
        { stripePaymentIntentId: 'pi_1' },
        { storeCreditDebitExists: true },
        { providerPaymentState: 'CHARGED' },
        { providerMutationStartedAt: new Date() },
        { fulfillmentAuthority: 'AUTOMATED_COMPOSITE' },
        { fulfillmentProofExists: true },
        { unresolvedIntegrityIssueExists: true },
    ]) {
        assert.equal(
            decideStoreRenewalCancellationSafety({ ...safeInput, ...unsafe }).action,
            'REVIEW_REQUIRED'
        )
    }
})

test('2026-08 duplicate-charge regression: every supported renewal entry and continuation uses the durable guard', () => {
    for (const source of [
        routeSource('operations', 'start-renewal'),
        routeSource('operations', 'start-installment'),
        routeSource('store', 'subscriptions', 'start'),
    ]) {
        assert.match(source, /createGuardedRenewalOperation\(tx/)
    }

    for (const source of [
        routeSource('operations', '[id]', 'select-package'),
        routeSource('operations', '[id]', 'confirm-purchase'),
        routeSource('operations', '[id]', 'confirm-installment'),
        routeSource('operations', '[id]', 'apply-promo'),
        routeSource('operations', '[id]', 'cancel-confirm'),
        routeSource('store', 'subscriptions', '[id]', 'select-package'),
        routeSource('store', 'subscriptions', '[id]', 'confirm'),
    ]) {
        assert.match(source, /ensureGuardedRenewalOperationReservation\(tx/)
    }

    const confirmPayment = routeSource('store', 'subscriptions', '[id]', 'confirm-payment')
    const storePaymentFinalizer = readFileSync(
        join(process.cwd(), 'src', 'lib', 'store-subscription-payment-finalization.ts'),
        'utf8'
    )
    assert.match(confirmPayment, /finalizeStoreSubscriptionPayment\(tx/)
    assert.match(storePaymentFinalizer, /ensureGuardedRenewalOperationReservation\(tx/)

    const stripeWebhook = routeSource('store', 'webhooks', 'stripe')
    const mobilePaymentFinalizer = readFileSync(
        join(process.cwd(), 'src', 'lib', 'mobile-renewal-payment-finalization.ts'),
        'utf8'
    )
    assert.match(stripeWebhook, /finalizeMobileRenewalPayment\(tx/)
    assert.match(mobilePaymentFinalizer, /acquireCardLifecycleReservation\(tx/)
})

test('unsupported generic and legacy mobile RENEW jobs fail closed before deduction or dispatch', () => {
    const create = routeSource('operations', 'create')
    const bulk = routeSource('operations', 'bulk')
    const mobileCheck = routeSource('mobile', 'subscriptions', 'check')
    const mobileRenew = routeSource('mobile', 'subscriptions', 'renew')

    assert.ok(create.indexOf('legacyRenewalRouteDisabledPayload()') < create.indexOf('balance: { decrement: price }'))
    assert.ok(bulk.indexOf('legacyRenewalRouteDisabledPayload()') < bulk.indexOf('balance: { decrement: finalTotalPrice }'))
    assert.doesNotMatch(mobileCheck, /operation\.create|addCustomerOperationJob/)
    assert.doesNotMatch(mobileRenew, /walletBalance: \{ decrement|addCustomerOperationJob/)
})

test('mobile payment intent asserts reservation and uses one stable provider idempotency key', () => {
    const source = routeSource('mobile', 'subscriptions', 'create-payment-intent')
    const firstGuard = source.indexOf('ensureGuardedRenewalOperationReservation(tx')
    const providerCreate = source.indexOf('stripe.paymentIntents.create')

    assert.ok(firstGuard >= 0 && firstGuard < providerCreate)
    assert.match(source, /idempotencyKey: `mobile-renewal:\$\{operation\.id\}`/)
    assert.match(source, /REUSABLE_PAYMENT_INTENT_STATUSES/)
    assert.match(source, /PAYMENT_INTENT_REVIEW_REQUIRED/)
})

test('aged store renewals are review-blocked and never auto-cancelled by elapsed time alone', () => {
    const source = routeSource('store', 'subscriptions', 'start')
    assert.match(source, /SUBSCRIPTION_REVIEW_REQUIRED/)
    assert.doesNotMatch(source, /Auto-cancelled expired subscription|Automatically cancelled due to timeout/)
})
