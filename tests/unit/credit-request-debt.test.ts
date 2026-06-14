import test from 'node:test'
import assert from 'node:assert/strict'
import {
    calculateDebtAfterPayment,
    summarizeCreditDebt,
    validateCreditRequestCapacity,
} from '@/lib/credit-requests/debt'

test('summarizes pending requests plus unpaid approved debt against the configured limit', () => {
    const summary = summarizeCreditDebt({
        creditDebtLimitUsd: 1000,
        pendingRequests: [
            { amountUsd: 500 },
            { amountUsd: 250 },
        ],
        ledgerEntries: [
            { entryType: 'CREDIT_APPROVED', amountUsd: 400 },
            { entryType: 'PAYMENT_RECORDED', amountUsd: 150 },
        ],
    })

    assert.deepEqual(summary, {
        creditDebtLimitUsd: 1000,
        pendingRequestedUsd: 750,
        outstandingDebtUsd: 250,
        usedCapacityUsd: 1000,
        availableUsd: 0,
        hasLimit: true,
    })
})

test('allows multiple pending requests while the total stays within remaining capacity', () => {
    const summary = summarizeCreditDebt({
        creditDebtLimitUsd: 1000,
        pendingRequests: [{ amountUsd: 500 }],
        ledgerEntries: [],
    })

    assert.equal(validateCreditRequestCapacity(summary, 500).allowed, true)
    assert.deepEqual(validateCreditRequestCapacity(summary, 501), {
        allowed: false,
        reason: 'CREDIT_LIMIT_EXCEEDED',
        availableUsd: 500,
    })
})

test('payment reduces outstanding debt and opens request capacity without changing pending requests', () => {
    const beforePayment = summarizeCreditDebt({
        creditDebtLimitUsd: 1000,
        pendingRequests: [],
        ledgerEntries: [
            { entryType: 'CREDIT_APPROVED', amountUsd: 1000 },
            { entryType: 'PAYMENT_RECORDED', amountUsd: 400 },
        ],
    })

    assert.equal(beforePayment.outstandingDebtUsd, 600)
    assert.equal(beforePayment.availableUsd, 400)
    assert.deepEqual(calculateDebtAfterPayment(beforePayment, 250), {
        allowed: true,
        debtAfterUsd: 350,
    })
})

test('blocks requests when limit is missing or zero', () => {
    const summary = summarizeCreditDebt({
        creditDebtLimitUsd: null,
        pendingRequests: [],
        ledgerEntries: [],
    })

    assert.deepEqual(validateCreditRequestCapacity(summary, 1), {
        allowed: false,
        reason: 'CREDIT_LIMIT_NOT_CONFIGURED',
        availableUsd: 0,
    })
})

test('rejects overpayment beyond outstanding debt', () => {
    const summary = summarizeCreditDebt({
        creditDebtLimitUsd: 1000,
        pendingRequests: [],
        ledgerEntries: [
            { entryType: 'CREDIT_APPROVED', amountUsd: 300 },
            { entryType: 'PAYMENT_RECORDED', amountUsd: 100 },
        ],
    })

    assert.deepEqual(calculateDebtAfterPayment(summary, 201), {
        allowed: false,
        reason: 'PAYMENT_EXCEEDS_DEBT',
        debtAfterUsd: 200,
    })
})
