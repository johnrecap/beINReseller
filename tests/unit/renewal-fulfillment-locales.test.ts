import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { en } from '@/i18n/translations/en'
import { ar } from '@/i18n/translations/ar'
import { bn } from '@/i18n/translations/bn'

test('all locales expose renewal fulfillment safety messages', () => {
    for (const catalog of [en, ar, bn]) {
        assert.ok(catalog.operations.providerChargedVerifyingFulfillment)
        assert.ok(catalog.operations.providerChargedFulfillmentUnderReview)
        assert.ok(catalog.operations.fulfillmentReviewPending)
        assert.ok(catalog.operations.confirmCardRenewedManually)
        assert.ok(catalog.operations.automatedFulfillmentConfirmed)
        assert.ok(catalog.operations.manualFulfillmentConfirmed)
        assert.ok(catalog.operations.manualFulfillmentEvidenceRequired)
        assert.ok(catalog.operations.reviewOnlyMatched)
        assert.ok(catalog.operations.fulfillmentProofConflict)
    }
})

test('Arabic renewal fulfillment messages are real localized text', () => {
    assert.match(ar.operations.providerChargedVerifyingFulfillment, /[\u0600-\u06FF]/)
    assert.match(ar.operations.providerChargedFulfillmentUnderReview, /[\u0600-\u06FF]/)
    assert.match(ar.operations.automatedFulfillmentConfirmed, /[\u0600-\u06FF]/)
    assert.match(ar.operations.manualFulfillmentConfirmed, /[\u0600-\u06FF]/)
    assert.match(ar.operations.manualFulfillmentEvidenceRequired, /[\u0600-\u06FF]/)
})

test('active operations keeps review-required renewals visible', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'app', 'dashboard', 'operations', 'active', 'page.tsx'), 'utf8')
    const activeFilter = source.match(/\['PENDING'[\s\S]*?\.includes\(op\.status\)/)?.[0] || ''

    assert.match(activeFilter, /'REVIEW_REQUIRED'/)
    assert.match(source, /providerChargedVerifyingFulfillment/)
    assert.match(source, /providerChargedFulfillmentUnderReview/)
})

test('public operation API keeps existing state fields and exposes only safe fulfillment authority metadata', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'operations', 'route.ts'), 'utf8')

    assert.match(source, /providerPaymentState/)
    assert.match(source, /fulfillmentState/)
    assert.match(source, /fulfillmentAuthority/)
    assert.match(source, /fulfillmentConfirmedAt/)
    assert.doesNotMatch(source, /manualEvidenceId\s*:/)
    assert.doesNotMatch(source, /manualFulfillmentEvidence\s*:/)
    assert.doesNotMatch(source, /fulfillmentInvoiceNo\s*:/)
})

test('admin review API requests complete manual evidence and may expose its safe audit fields', () => {
    const listSource = readFileSync(join(
        process.cwd(),
        'src',
        'app',
        'api',
        'admin',
        'financial-review',
        'route.ts'
    ), 'utf8')
    const decisionSource = readFileSync(join(
        process.cwd(),
        'src',
        'app',
        'api',
        'admin',
        'financial-review',
        '[operationId]',
        'decision',
        'route.ts'
    ), 'utf8')

    for (const field of [
        'invoiceNo',
        'beinAccountId',
        'cardNumberSnapshot',
        'packageNameSnapshot',
        'providerAmount',
        'currency',
        'evidenceSource',
        'evidenceNote',
        'observedAt',
    ]) {
        assert.match(decisionSource, new RegExp(`\\b${field}\\b`), field)
    }

    assert.match(listSource, /manualFulfillmentEvidence/)
    assert.match(listSource, /fulfillmentAuthority/)
    assert.match(listSource, /manualEvidenceId/)
})
