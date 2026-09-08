import test from 'node:test'
import assert from 'node:assert/strict'
import {
    resolveAuditOwner,
    decideInstallmentEvidence,
    isRefundSettlementVeto,
    remainingRefundMinor,
    inspectFixedPaymentClaim,
    isAuditActionRevisionAllowed,
} from '../../shared/operations/audit-financial-context'
import { isAuditDisposableDatabaseConfigured } from '../helpers/disposable-database'
import { AuditOperationFixture, withAuditOperationFixture } from '../helpers/audit-operation-fixtures'
import type { PrismaClient } from '@prisma/client'

test('T005 fixture card identifiers satisfy the existing 10-16 digit API contract', () => {
    for (let i = 0; i < 20; i++) {
        const fixture = new AuditOperationFixture({} as PrismaClient, 'reseller')
        assert.match(fixture.cardNumber, /^\d{10,16}$/)
    }
})

test('T005 fixture wrapper refuses execution before database imports without opt-in', async () => {
    const previous = process.env.RUN_DB_INTEGRATION
    process.env.RUN_DB_INTEGRATION = '0'
    try {
        await assert.rejects(withAuditOperationFixture('reseller', async () => {
            assert.fail('An unconfigured fixture callback must not run')
        }), /AUDIT_DISPOSABLE_DATABASE_REQUIRED/)
    } finally {
        if (previous === undefined) delete process.env.RUN_DB_INTEGRATION
        else process.env.RUN_DB_INTEGRATION = previous
    }
})

test('T003 ownership is exactly one source and replay cannot switch owner', () => {
    assert.deepEqual(resolveAuditOwner({ userId: 'u1', customerId: null }), { kind: 'RESELLER', id: 'u1' })
    assert.deepEqual(resolveAuditOwner({ userId: null, customerId: 'c1' }), { kind: 'CUSTOMER', id: 'c1' })
    for (const owner of [{}, { userId: '', customerId: null }, { userId: 'u1', customerId: 'c1' }]) {
        assert.throws(() => resolveAuditOwner(owner), /OWNER/)
    }
    assert.throws(() => resolveAuditOwner({ customerId: 'c1' }, { customerId: 'c2' }), /OWNER/)
})

test('T003 charge evidence is not installment settlement or refund authority', () => {
    const context = {
        operationId: 'o1', beinAccountId: 'a1', cardNumber: '7100000001',
        installmentId: 'due1', correlationKey: 'attempt1', mutationStartedAt: new Date('2026-09-07T00:00:00Z'),
    }
    const evidence = { ...context, observedAt: new Date('2026-09-07T00:01:00Z'),
        paymentState: 'CHARGED', settlementState: 'UNKNOWN', evidenceVersion: 1,
        settlementReference: null, rejectionReference: null }
    assert.equal(decideInstallmentEvidence(context, evidence), 'REVIEW_REQUIRED')
    assert.equal(decideInstallmentEvidence(context, { ...evidence, settlementState: 'SETTLED', settlementReference: 'receipt1' }), 'COMPLETE')
    assert.equal(decideInstallmentEvidence(context, { ...evidence, paymentState: 'NOT_CHARGED',
        settlementState: 'NOT_SETTLED', rejectionReference: 'rejected-attempt1' }), 'REFUND_ELIGIBLE')
    for (const changed of [
        { installmentId: 'other' }, { correlationKey: 'other' }, { evidenceVersion: 0 },
        { observedAt: new Date('invalid') }, { observedAt: new Date('2026-09-06T00:00:00Z') },
        { mutationStartedAt: new Date('2026-09-06T23:59:59Z') },
        { settlementState: 'SETTLED', settlementReference: ' ' },
        { paymentState: 'NOT_CHARGED', settlementState: 'SETTLED', settlementReference: 'receipt1' },
    ]) assert.equal(decideInstallmentEvidence(context, { ...evidence, ...changed }), 'REVIEW_REQUIRED')
})

test('T003 every non-cancelled refund state vetoes incompatible mutation, including terminal refund', () => {
    for (const state of ['REQUESTED', 'DISPATCH_FENCED', 'PROVIDER_PENDING', 'PARTIAL',
        'PROVIDER_CONFIRMED', 'LOCAL_SETTLED', 'COMPLETED', 'UNKNOWN', 'EVIDENCE_HOLD',
        'EXHAUSTED', 'RETRY_FAILED', 'FUTURE_UNRECOGNIZED']) {
        assert.equal(isRefundSettlementVeto({ state }), true)
    }
    assert.equal(isRefundSettlementVeto(null), false)
    assert.equal(isRefundSettlementVeto({ state: 'CANCELLED' }), true)
    const cancelled = { state: 'CANCELLED', cancellationEvidenceReference: 'verified-no-effect',
        reservedExternalMinor: 0, reservedStoreCreditMinor: 0, reservedWalletMinor: 0,
        confirmedExternalMinor: 0, confirmedStoreCreditMinor: 0, confirmedWalletMinor: 0 }
    assert.equal(isRefundSettlementVeto(cancelled), false)
    assert.equal(isRefundSettlementVeto({ ...cancelled, reservedStoreCreditMinor: 1 }), true)
    assert.equal(isRefundSettlementVeto({ ...cancelled, reservedWalletMinor: 1 }), true)
    assert.equal(isRefundSettlementVeto({ state: 'CANCELLED', cancellationEvidenceReference: 'verified-no-effect' }), true)
})

test('T003 outstanding reservations count against each original funding leg', () => {
    assert.equal(remainingRefundMinor({ original: 1000, confirmed: 400, reserved: 500 }), 100)
    assert.throws(() => remainingRefundMinor({ original: 1000, confirmed: 400, reserved: 601 }), /AMOUNT/)
    for (const value of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => remainingRefundMinor({ original: value, confirmed: 0, reserved: 0 }), /AMOUNT/)
    }
})

test('T003 fixed claim deadline ignores heartbeat and missing legacy dates stay review', () => {
    const claimedAt = new Date('2026-09-07T00:00:00Z')
    const claim = { claimedAt, expiresAt: new Date('2026-09-07T00:02:00Z'), key: 'claim1' }
    assert.equal(inspectFixedPaymentClaim(claim, new Date('2026-09-07T00:01:59Z')), 'IN_PROGRESS')
    assert.equal(inspectFixedPaymentClaim(claim, new Date('2026-09-07T00:02:00Z')), 'RECOVERY_REQUIRED')
    assert.equal(inspectFixedPaymentClaim({ ...claim, claimedAt: null }, claimedAt), 'LEGACY_CLAIM_REVIEW')
    assert.equal(inspectFixedPaymentClaim({ ...claim, expiresAt: new Date('2026-09-07T00:03:00Z') }, claimedAt), 'INVALID_CLAIM')
    assert.equal(inspectFixedPaymentClaim(claim, new Date('invalid')), 'INVALID_CLAIM')
})

test('T003 only explicitly repeatable preparation can use a nonzero revision', () => {
    assert.equal(isAuditActionRevisionAllowed('APPLY_PROMO', 2), true)
    for (const job of ['COMPLETE_PURCHASE', 'CONFIRM_PURCHASE', 'CONFIRM_INSTALLMENT', 'UNKNOWN']) {
        assert.equal(isAuditActionRevisionAllowed(job, 1), false)
        assert.equal(isAuditActionRevisionAllowed(job, 0), true)
    }
    for (const revision of [-1, 0.1, NaN, Infinity]) assert.equal(isAuditActionRevisionAllowed('APPLY_PROMO', revision), false)
})

test('T005 audit guard rejects real, malformed and redirected connection targets even with confirmation', () => {
    const env = { RUN_DB_INTEGRATION: '1', CONFIRM_DISPOSABLE_RENEWAL_FULFILLMENT_DB: '1',
        NODE_ENV: 'test' as const, DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:5432/audit_disposable' }
    assert.equal(isAuditDisposableDatabaseConfigured(env), true)
    for (const url of ['garbage', 'https://localhost/audit_test',
        'postgresql://localhost/production', 'postgresql://db.example.com/audit_test',
        env.DATABASE_URL + '?host=db.example.com', env.DATABASE_URL + '?options=-csearch_path=public']) {
        assert.equal(isAuditDisposableDatabaseConfigured({ ...env, DATABASE_URL: url }), false)
    }
    assert.equal(isAuditDisposableDatabaseConfigured({ ...env, NODE_ENV: 'production' }), false)
    assert.equal(isAuditDisposableDatabaseConfigured({ ...env, RUN_DB_INTEGRATION: '0' }), false)
})
