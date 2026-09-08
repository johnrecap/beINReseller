import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    buildStorePaymentIntentIdempotencyKey,
    decideExistingStorePaymentClaim,
    isStoreCreditDebitLedgerConsistent,
    STORE_PAYMENT_INTENT_CLAIM_TTL_MS,
} from '../../src/lib/store-subscription-payment-claim'

const selectedPackage = {
    index: 3,
    name: 'Premium 12 Months',
    price: 174,
}

function persisted(overrides: Record<string, unknown> = {}) {
    return {
        status: 'AWAITING_PAYMENT',
        packageName: selectedPackage.name,
        packagePrice: selectedPackage.price,
        price: 209,
        creditUsed: 9,
        stripePaymentIntentId: null,
        paymentId: null,
        paymentStatus: null,
        updatedAt: new Date('2026-08-24T12:00:00.000Z'),
        selectedPackage,
        ...overrides,
    }
}

test('2026-08 store renewal regression: provider idempotency key is stable per operation subscription and package', () => {
    const input = {
        operationId: 'operation-1',
        subscriptionId: 'subscription-1',
        packageIndex: selectedPackage.index,
    }

    assert.equal(
        buildStorePaymentIntentIdempotencyKey(input),
        buildStorePaymentIntentIdempotencyKey(input)
    )
    assert.notEqual(
        buildStorePaymentIntentIdempotencyKey(input),
        buildStorePaymentIntentIdempotencyKey({ ...input, packageIndex: 4 })
    )
})

test('2026-08 store renewal regression: concurrent payment claim never starts a second provider intent', () => {
    const decision = decideExistingStorePaymentClaim({
        persisted: persisted(),
        selectedPackage,
        customerPrice: 209,
        now: new Date('2026-08-24T12:00:10.000Z'),
    })

    assert.equal(decision, 'IN_PROGRESS')
})

test('persisted payment and intent are reused without deducting credit again', () => {
    const decision = decideExistingStorePaymentClaim({
        persisted: persisted({
            stripePaymentIntentId: 'pi_store_1',
            paymentId: 'payment-1',
            paymentStatus: 'PENDING',
        }),
        selectedPackage,
        customerPrice: 209,
        now: new Date('2026-08-24T12:00:10.000Z'),
    })

    assert.equal(decision, 'REUSE_INTENT')
})

test('cancelled or refunded provider payment evidence is never reused', () => {
    for (const paymentStatus of ['CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED']) {
        const decision = decideExistingStorePaymentClaim({
            persisted: persisted({
                stripePaymentIntentId: 'pi_store_terminal',
                paymentId: 'payment-terminal',
                paymentStatus,
            }),
            selectedPackage,
            customerPrice: 209,
            now: new Date('2026-08-24T12:00:10.000Z'),
        })

        assert.equal(decision, 'REVIEW_REQUIRED')
    }
})

test('stale or partially persisted provider claim fails closed for review', () => {
    for (const candidate of [
        persisted({ updatedAt: new Date(0) }),
        persisted({ stripePaymentIntentId: 'pi_partial' }),
        persisted({ paymentId: 'payment-partial' }),
    ]) {
        assert.equal(
            decideExistingStorePaymentClaim({
                persisted: candidate,
                selectedPackage,
                customerPrice: 209,
                now: new Date(STORE_PAYMENT_INTENT_CLAIM_TTL_MS + 1),
            }),
            'REVIEW_REQUIRED'
        )
    }
})

test('a different package cannot replace an existing payment claim', () => {
    const decision = decideExistingStorePaymentClaim({
        persisted: persisted(),
        selectedPackage: { ...selectedPackage, index: 4 },
        customerPrice: 209,
        now: new Date('2026-08-24T12:00:10.000Z'),
    })

    assert.equal(decision, 'SELECTION_CONFLICT')
})

test('a completed claim is idempotently recognized as already advanced', () => {
    const decision = decideExistingStorePaymentClaim({
        persisted: persisted({
            status: 'COMPLETING',
            stripePaymentIntentId: 'pi_store_1',
            paymentId: 'payment-1',
            paymentStatus: 'SUCCEEDED',
        }),
        selectedPackage,
        customerPrice: 209,
        now: new Date('2026-08-24T12:00:10.000Z'),
    })

    assert.equal(decision, 'ALREADY_ADVANCED')
})

test('payment evidence in a pre-selection or partial advanced state requires review', () => {
    for (const candidate of [
        persisted({
            status: 'AWAITING_PACKAGE',
            stripePaymentIntentId: 'pi_unexpected',
        }),
        persisted({
            status: 'PAID',
            stripePaymentIntentId: 'pi_partial',
            paymentId: null,
        }),
    ]) {
        assert.equal(
            decideExistingStorePaymentClaim({
                persisted: candidate,
                selectedPackage,
                customerPrice: 209,
                now: new Date('2026-08-24T12:00:10.000Z'),
            }),
            'REVIEW_REQUIRED'
        )
    }
})

test('store-credit debit ledger requires one exact immutable minor-unit entry', () => {
    const validEntry = {
        amountMinor: 900,
        balanceBeforeMinor: 2500,
        balanceAfterMinor: 1600,
        currency: 'SAR',
    }
    assert.equal(isStoreCreditDebitLedgerConsistent({
        creditUsedMinor: 900,
        currency: 'SAR',
        entries: [validEntry],
    }), true)

    for (const entries of [
        [],
        [{ ...validEntry, amountMinor: 800 }],
        [{ ...validEntry, currency: 'EGP' }],
        [validEntry, validEntry],
    ]) {
        assert.equal(isStoreCreditDebitLedgerConsistent({
            creditUsedMinor: 900,
            currency: 'SAR',
            entries,
        }), false)
    }
})

test('store-credit migration fails closed on stale concurrent negative balances', () => {
    const migration = readFileSync(
        join(
            process.cwd(),
            'prisma',
            'migrations',
            '20260824160000_store_subscription_credit_ledger',
            'migration.sql'
        ),
        'utf8'
    )

    assert.match(migration, /customers_store_credit_nonnegative_check/)
    assert.match(migration, /CHECK \(\s*"store_credit" >= 0/)
    assert.match(migration, /NOT VALID/)
    assert.match(migration, /store_credit_ledger_entries_balance_direction_check/)
})

test('2026-08 store renewal regression: local claim and zero-credit outbox precede provider delivery', () => {
    const route = readFileSync(
        join(
            process.cwd(),
            'src',
            'app',
            'api',
            'store',
            'subscriptions',
            '[id]',
            'select-package',
            'route.ts'
        ),
        'utf8'
    )
    const claimTransaction = route.indexOf('const claim = await prisma.$transaction')
    const localStateClaim = route.indexOf("status: amountMinor === 0 ? 'PAID' : 'AWAITING_PAYMENT'", claimTransaction)
    const immutableCreditLedger = route.indexOf('await tx.storeCreditLedgerEntry.create', localStateClaim)
    const durableDispatch = route.indexOf('await createOperationDispatch(tx', immutableCreditLedger)
    const providerCreate = route.indexOf('stripe.paymentIntents.create', durableDispatch)

    assert.ok(claimTransaction >= 0)
    assert.ok(localStateClaim > claimTransaction)
    assert.ok(immutableCreditLedger > localStateClaim)
    assert.ok(durableDispatch > immutableCreditLedger)
    assert.ok(providerCreate > durableDispatch)
    assert.match(route, /idempotencyKey: buildStorePaymentIntentIdempotencyKey/)
})

test('2026-08 store renewal regression: confirm and webhook share one idempotent finalizer', () => {
    const confirmRoute = readFileSync(
        join(
            process.cwd(),
            'src',
            'app',
            'api',
            'store',
            'subscriptions',
            '[id]',
            'confirm-payment',
            'route.ts'
        ),
        'utf8'
    )
    const webhookRoute = readFileSync(
        join(process.cwd(), 'src', 'app', 'api', 'store', 'webhooks', 'stripe', 'route.ts'),
        'utf8'
    )

    assert.match(confirmRoute, /finalizeStoreSubscriptionPayment\(tx/)
    assert.doesNotMatch(confirmRoute, /tx\.payment\.create/)
    assert.match(webhookRoute, /finalizeStoreSubscriptionPayment\(tx/)
})

test('2026-08 store renewal regression: failure refund is ledger-backed and provider-safe', () => {
    const source = readFileSync(
        join(process.cwd(), 'src', 'lib', 'store-subscription.ts'),
        'utf8'
    )

    assert.match(source, /FOR UPDATE/)
    assert.match(source, /isStoreCreditDebitLedgerConsistent/)
    assert.match(source, /entryType: 'REFUND'/)
    assert.match(source, /providerPaymentState === 'NOT_SUBMITTED'/)
    assert.match(source, /providerPaymentState === 'NOT_CHARGED'/)
    assert.match(source, /fulfillmentVerificationOutcome === 'VALID_NO_MATCH'/)
    assert.match(source, /!subscription\.operation\.fulfillmentProof/)
})

test('2026-08 store renewal regression: cancellation rechecks the payment claim under locks', () => {
    const source = readFileSync(
        join(
            process.cwd(),
            'src',
            'app',
            'api',
            'store',
            'subscriptions',
            '[id]',
            'cancel',
            'route.ts'
        ),
        'utf8'
    )

    const transaction = source.indexOf('const cancellation = await prisma.$transaction')
    const subscriptionLock = source.indexOf('FOR UPDATE', transaction)
    const lockedDecision = source.indexOf('decideStoreRenewalCancellationSafety', subscriptionLock)
    const cancellationWrite = source.indexOf("data: { status: 'CANCELLED' }", lockedDecision)

    assert.ok(transaction >= 0)
    assert.ok(subscriptionLock > transaction)
    assert.ok(lockedDecision > subscriptionLock)
    assert.ok(cancellationWrite > lockedDecision)
    assert.doesNotMatch(source, /storeCredit:\s*\{\s*increment:/)
    assert.doesNotMatch(source, /'AWAITING_PACKAGE',\s*'AWAITING_PAYMENT'/)
})
