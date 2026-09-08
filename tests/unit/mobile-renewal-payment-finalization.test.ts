import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    decideMobileRenewalPaymentTransition,
    isExactMobileRenewalProviderPayment,
    MobileRenewalProviderPayment,
} from '../../src/lib/mobile-renewal-payment-contract'

const exactProvider: MobileRenewalProviderPayment = {
    id: 'pi_mobile_exact',
    status: 'succeeded',
    amount: 20_900,
    amountReceived: 20_900,
    currency: 'sar',
    metadata: {
        source: 'mobile_renewal',
        operationId: 'op_mobile_exact',
        customerId: 'customer_mobile_exact',
        packageName: 'Premium 12 Months',
        beinPrice: '174',
        customerPrice: '209',
    },
}

const exactProviderExpectation = {
    operationId: 'op_mobile_exact',
    customerId: 'customer_mobile_exact',
    packageName: 'Premium 12 Months',
    beinPrice: 174,
    customerPrice: 209,
    currency: 'SAR',
    requireSucceeded: true,
}

test('2026-08 mobile Stripe regression: only the exact preterminal pair can enter completing', () => {
    for (const paymentStatus of ['PENDING', 'PROCESSING', 'FAILED'] as const) {
        assert.equal(
            decideMobileRenewalPaymentTransition({
                paymentStatus,
                operationStatus: 'AWAITING_FINAL_CONFIRM',
            }),
            'FINALIZE'
        )
    }

    assert.equal(
        decideMobileRenewalPaymentTransition({
            paymentStatus: 'SUCCEEDED',
            operationStatus: 'COMPLETING',
        }),
        'REPLAY_DISPATCH'
    )
    for (const operationStatus of ['COMPLETED', 'REVIEW_REQUIRED'] as const) {
        assert.equal(
            decideMobileRenewalPaymentTransition({
                paymentStatus: 'SUCCEEDED',
                operationStatus,
            }),
            'REPLAY_TERMINAL'
        )
    }

    for (const paymentStatus of ['CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'] as const) {
        assert.equal(
            decideMobileRenewalPaymentTransition({
                paymentStatus,
                operationStatus: 'AWAITING_FINAL_CONFIRM',
            }),
            'IGNORE_TERMINAL_PAYMENT'
        )
    }

    assert.equal(
        decideMobileRenewalPaymentTransition({
            paymentStatus: 'SUCCEEDED',
            operationStatus: 'AWAITING_FINAL_CONFIRM',
        }),
        'RECORD_SUCCESS_REVIEW'
    )
    assert.equal(
        decideMobileRenewalPaymentTransition({
            paymentStatus: 'PENDING',
            operationStatus: 'COMPLETED',
        }),
        'RECORD_SUCCESS_REVIEW'
    )
    assert.equal(
        decideMobileRenewalPaymentTransition({
            paymentStatus: 'PENDING',
            operationStatus: 'CANCELLED',
        }),
        'RECORD_SUCCESS_REVIEW'
    )
})

test('mobile Stripe success requires exact provider amount, currency, and metadata linkage', () => {
    assert.equal(
        isExactMobileRenewalProviderPayment({
            provider: exactProvider,
            ...exactProviderExpectation,
        }),
        true
    )

    const mismatches: MobileRenewalProviderPayment[] = [
        { ...exactProvider, status: 'processing' },
        { ...exactProvider, amount: 20_899 },
        { ...exactProvider, amountReceived: 20_899 },
        { ...exactProvider, currency: 'egp' },
        { ...exactProvider, metadata: { ...exactProvider.metadata, source: 'store_renewal' } },
        { ...exactProvider, metadata: { ...exactProvider.metadata, operationId: 'op_other' } },
        { ...exactProvider, metadata: { ...exactProvider.metadata, customerId: 'customer_other' } },
        { ...exactProvider, metadata: { ...exactProvider.metadata, packageName: 'Other package' } },
        { ...exactProvider, metadata: { ...exactProvider.metadata, beinPrice: '173.99' } },
        { ...exactProvider, metadata: { ...exactProvider.metadata, customerPrice: '208.99' } },
    ]

    for (const provider of mismatches) {
        assert.equal(
            isExactMobileRenewalProviderPayment({
                provider,
                ...exactProviderExpectation,
            }),
            false
        )
    }
})

test('mobile Stripe routes use the shared CAS persistence/finalization boundary', () => {
    const webhook = readFileSync(
        join(process.cwd(), 'src', 'app', 'api', 'store', 'webhooks', 'stripe', 'route.ts'),
        'utf8'
    )
    const createIntent = readFileSync(
        join(process.cwd(), 'src', 'app', 'api', 'mobile', 'subscriptions', 'create-payment-intent', 'route.ts'),
        'utf8'
    )
    const finalizer = readFileSync(
        join(process.cwd(), 'src', 'lib', 'mobile-renewal-payment-finalization.ts'),
        'utf8'
    )

    assert.match(webhook, /finalizeMobileRenewalPayment\(tx/)
    assert.match(webhook, /localPaymentMetadata\?\.source === 'mobile_renewal'/)
    assert.match(createIntent, /persistMobileRenewalPaymentIntent\(tx/)
    assert.match(createIntent, /idempotencyKey: `mobile-renewal:\$\{operation\.id\}`/)
    assert.match(finalizer, /status: \{ in: \[\.\.\.PRETERMINAL_MOBILE_PAYMENT_STATUSES\] \}/)
    assert.match(finalizer, /status: 'AWAITING_FINAL_CONFIRM'/)
    assert.doesNotMatch(finalizer, /data: \{ status: 'COMPLETING' \}[\s\S]{0,200}where:/)
})

test('delayed Stripe failure events cannot downgrade succeeded or refunded payments', () => {
    const webhook = readFileSync(
        join(process.cwd(), 'src', 'app', 'api', 'store', 'webhooks', 'stripe', 'route.ts'),
        'utf8'
    )
    const failedHandler = webhook.slice(
        webhook.indexOf('async function handlePaymentFailed'),
        webhook.indexOf('async function handleRefund')
    )

    assert.match(failedHandler, /status: \{ in: \['PENDING', 'PROCESSING'\] \}/)
    assert.doesNotMatch(failedHandler, /payment\.update\(/)
})
