import test from 'node:test'
import assert from 'node:assert/strict'
import {
    findDuplicateRenewalBursts,
    parseRenewalFulfillmentReconciliationArgs,
} from '@/lib/renewal-fulfillment/reconciliation'

test('requires bounded timestamps and exact apply confirmation', () => {
    assert.throws(() => parseRenewalFulfillmentReconciliationArgs([]), /--from and --to are required/)
    assert.throws(() => parseRenewalFulfillmentReconciliationArgs([
        '--from', '2026-08-23T18:35:00+03:00',
        '--to', '2026-08-23T18:45:00+03:00',
        '--apply',
    ]), /APPLY_FULFILLMENT_SAFETY_ISSUES/)
})

test('parses the exact Cairo incident filter as a dry run', () => {
    const parsed = parseRenewalFulfillmentReconciliationArgs([
        '--from', '2026-08-23T18:35:00+03:00',
        '--to', '2026-08-23T18:45:00+03:00',
        '--card', '7517687161',
    ])

    assert.equal(parsed.apply, false)
    assert.equal(parsed.cardNumber, '7517687161')
    assert.equal(parsed.duplicateWindowMinutes, 10)
    assert.equal(parsed.from.toISOString(), '2026-08-23T15:35:00.000Z')
    assert.equal(parsed.to.toISOString(), '2026-08-23T15:45:00.000Z')
})

test('validates a bounded duplicate detection window', () => {
    const parsed = parseRenewalFulfillmentReconciliationArgs([
        '--from', '2026-08-23T18:35:00+03:00',
        '--to', '2026-08-23T18:45:00+03:00',
        '--duplicate-window-minutes', '15',
    ])

    assert.equal(parsed.duplicateWindowMinutes, 15)
    assert.throws(
        () => parseRenewalFulfillmentReconciliationArgs([
            '--from', '2026-08-23T18:35:00+03:00',
            '--to', '2026-08-23T18:45:00+03:00',
            '--duplicate-window-minutes', '0',
        ]),
        /integer from 1 to 1440/
    )
})

test('rejects ambiguous timestamps, unknown flags, duplicate flags, and missing values', () => {
    assert.throws(
        () => parseRenewalFulfillmentReconciliationArgs([
            '--from', '2026-08-23T18:35:00',
            '--to', '2026-08-23T18:45:00+03:00',
        ]),
        /explicit UTC offset or Z/
    )
    assert.throws(
        () => parseRenewalFulfillmentReconciliationArgs([
            '--from', '2026-08-23T18:35:00+03:00',
            '--to', '2026-08-23T18:45:00+03:00',
            '--cardd', '7517687161',
        ]),
        /Unknown reconciliation flag/
    )
    assert.throws(
        () => parseRenewalFulfillmentReconciliationArgs([
            '--from', '2026-08-23T18:35:00+03:00',
            '--from', '2026-08-23T18:36:00+03:00',
            '--to', '2026-08-23T18:45:00+03:00',
        ]),
        /Duplicate reconciliation flag/
    )
    assert.throws(
        () => parseRenewalFulfillmentReconciliationArgs([
            '--from',
            '--to', '2026-08-23T18:45:00+03:00',
        ]),
        /--from requires a value/
    )
})

test('finds same-card package and amount charge bursts inside the window', () => {
    const bursts = findDuplicateRenewalBursts([
        { operationId: 'op-1', cardNumber: '7517687161', packageName: 'Premium 12 Months', amount: 174, chargedAt: new Date('2026-08-23T15:40:00Z') },
        { operationId: 'op-2', cardNumber: '7517687161', packageName: 'Premium 12 Months', amount: 174, chargedAt: new Date('2026-08-23T15:41:00Z') },
        { operationId: 'op-3', cardNumber: '7517687161', packageName: 'Premium 12 Months', amount: 216, chargedAt: new Date('2026-08-23T15:42:00Z') },
    ], 10)

    assert.equal(bursts.length, 1)
    assert.deepEqual(bursts[0]?.operationIds, ['op-1', 'op-2'])
})
