import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    compareExistingFulfillmentProof,
    normalizeFulfillmentInvoice,
    validateCompositeFulfillmentProofCandidate,
    validateManualFulfillmentEvidenceInput,
    type FulfillmentProofCandidate,
    type ManualFulfillmentEvidenceInput,
} from '../../worker/src/lib/fulfillment-proof'

const candidate = {
    operationId: 'operation-1',
    beinAccountId: 'bein-1',
    cardNumberSnapshot: '7517687161',
    invoiceNo: '0053005727',
    proofKind: 'SOLD_REPORT_CONTRACT_CORRELATION',
    selectedPackageName: 'Premium 12 Months',
    contractPackageName: 'Premium 12 Months',
    contractStatus: 'Active',
    contractType: 'Renewal',
    contractStartDate: '23/08/2026',
    contractExpiryDate: '22/08/2027',
    verificationSource: 'POST_FINAL_PAY',
    providerCheckedAt: new Date('2026-08-23T15:41:00.000Z'),
    baselineId: 'baseline-1',
    sessionGeneration: 'session-generation-1',
    baselineCapturedAt: new Date('2026-08-23T15:39:00.000Z'),
    reportObservedAt: new Date('2026-08-23T15:41:05.000Z'),
    contractObservedAt: new Date('2026-08-23T15:41:10.000Z'),
    reportRowFingerprint: 'a'.repeat(64),
    providerAmount: '174.00',
    currency: 'USD',
    reportPackageName: 'Add Premium 12 Months',
    reportItemType: 'Card_CISCO',
    dealerContextHash: 'b'.repeat(64),
} satisfies FulfillmentProofCandidate

const existingCompositeProof = {
    id: 'proof-1',
    operationId: candidate.operationId,
    beinAccountId: candidate.beinAccountId,
    cardNumberSnapshot: candidate.cardNumberSnapshot,
    invoiceNo: candidate.invoiceNo,
    proofKind: candidate.proofKind,
    selectedPackageName: candidate.selectedPackageName,
    contractPackageName: candidate.contractPackageName,
    contractStatus: candidate.contractStatus,
    contractType: candidate.contractType,
    contractStartDate: candidate.contractStartDate,
    contractExpiryDate: candidate.contractExpiryDate,
    verificationSource: candidate.verificationSource,
    providerCheckedAt: candidate.providerCheckedAt,
    baselineId: candidate.baselineId,
    sessionGeneration: candidate.sessionGeneration,
    baselineCapturedAt: candidate.baselineCapturedAt,
    reportObservedAt: candidate.reportObservedAt,
    contractObservedAt: candidate.contractObservedAt,
    reportRowFingerprint: candidate.reportRowFingerprint,
    providerAmount: candidate.providerAmount,
    currency: candidate.currency,
    reportPackageName: candidate.reportPackageName,
    reportItemType: candidate.reportItemType,
    dealerContextHash: candidate.dealerContextHash,
}

const manualEvidence = {
    operationId: candidate.operationId,
    beinAccountId: candidate.beinAccountId,
    invoiceNo: candidate.invoiceNo,
    cardNumberSnapshot: candidate.cardNumberSnapshot,
    packageNameSnapshot: candidate.selectedPackageName,
    providerAmount: candidate.providerAmount,
    currency: candidate.currency,
    evidenceSource: 'sold_report_invoice_detail',
    evidenceNote: 'Verified against the provider invoice detail page.',
    observedAt: new Date('2026-08-23T15:45:00.000Z'),
    actorUserId: 'admin-1',
} satisfies ManualFulfillmentEvidenceInput

test('normalizes a string invoice without dropping leading zeroes and rejects unsafe values', () => {
    assert.equal(normalizeFulfillmentInvoice('  0053005727  '), '0053005727')
    assert.equal(normalizeFulfillmentInvoice('   '), null)
    assert.equal(normalizeFulfillmentInvoice(undefined), null)
    assert.equal(normalizeFulfillmentInvoice(53005727 as unknown as string), null)
})

test('same operation and context can replay its proof idempotently', () => {
    assert.equal(compareExistingFulfillmentProof(existingCompositeProof, candidate), 'ALREADY_CLAIMED')
})

test('same operation with different invoice is a proof conflict', () => {
    assert.equal(compareExistingFulfillmentProof({
        operationId: candidate.operationId,
        beinAccountId: candidate.beinAccountId,
        cardNumberSnapshot: candidate.cardNumberSnapshot,
        invoiceNo: 'INV-OLD',
    }, candidate), 'OPERATION_PROOF_CONFLICT')
})

test('same invoice claimed by another operation is not idempotent', () => {
    assert.equal(compareExistingFulfillmentProof({
        operationId: 'operation-2',
        beinAccountId: candidate.beinAccountId,
        cardNumberSnapshot: candidate.cardNumberSnapshot,
        invoiceNo: candidate.invoiceNo,
    }, candidate), 'INVOICE_ALREADY_USED')
})

test('same operation and invoice with different composite context is a proof conflict', () => {
    assert.equal(compareExistingFulfillmentProof({
        ...existingCompositeProof,
        reportRowFingerprint: 'c'.repeat(64),
    }, candidate), 'OPERATION_PROOF_CONFLICT')
})

test('legacy contract-only row cannot be replayed as a composite proof', () => {
    assert.equal(compareExistingFulfillmentProof({
        ...existingCompositeProof,
        proofKind: 'LEGACY_CONTRACT_ONLY',
        baselineId: null,
        sessionGeneration: null,
        reportRowFingerprint: null,
        providerAmount: null,
        currency: null,
        dealerContextHash: null,
    }, candidate), 'OPERATION_PROOF_CONFLICT')
})

test('composite proof requires every baseline, report, contract, amount, and dealer field', () => {
    assert.deepEqual(validateCompositeFulfillmentProofCandidate(candidate), {
        valid: true,
        normalizedInvoiceNo: '0053005727',
    })

    const requiredFields = [
        'baselineId',
        'sessionGeneration',
        'baselineCapturedAt',
        'reportObservedAt',
        'contractObservedAt',
        'reportRowFingerprint',
        'providerAmount',
        'currency',
        'reportPackageName',
        'reportItemType',
        'dealerContextHash',
    ] as const

    for (const field of requiredFields) {
        const incomplete = { ...candidate, [field]: null }
        const result = validateCompositeFulfillmentProofCandidate(incomplete)
        assert.equal(result.valid, false, field)
        assert.equal(result.reason, 'COMPOSITE_METADATA_INCOMPLETE', field)
    }
})

test('manual authority requires complete attributed provider evidence rather than a boolean', () => {
    assert.deepEqual(validateManualFulfillmentEvidenceInput(manualEvidence), {
        valid: true,
        normalizedInvoiceNo: '0053005727',
        normalizedCurrency: 'USD',
        normalizedProviderAmount: '174.00',
    })

    const requiredFields = [
        'operationId',
        'beinAccountId',
        'invoiceNo',
        'cardNumberSnapshot',
        'packageNameSnapshot',
        'providerAmount',
        'currency',
        'evidenceSource',
        'evidenceNote',
        'observedAt',
        'actorUserId',
    ] as const

    for (const field of requiredFields) {
        const incomplete = { ...manualEvidence, [field]: null }
        const result = validateManualFulfillmentEvidenceInput(incomplete)
        assert.equal(result.valid, false, field)
        assert.equal(result.reason, 'MANUAL_EVIDENCE_INCOMPLETE', field)
    }
})

test('follow-up migration upgrades legacy claims before enabling cross-kind uniqueness', () => {
    const originalMigration = readFileSync(join(
        process.cwd(),
        'prisma',
        'migrations',
        '20260824090000_renewal_fulfillment_proof',
        'migration.sql'
    ), 'utf8')
    const followUpMigration = readFileSync(join(
        process.cwd(),
        'prisma',
        'migrations',
        '20260824130000_sold_report_fulfillment_correlation',
        'migration.sql'
    ), 'utf8')

    assert.doesNotMatch(originalMigration, /provider_invoice_claims|proof_kind|manual_fulfillment/i)
    assert.match(followUpMigration, /LEGACY_CONTRACT_ONLY/)
    assert.match(followUpMigration, /SOLD_REPORT_CONTRACT_CORRELATION/)
    assert.match(followUpMigration, /operation_manual_fulfillment_evidence/i)

    const statements = followUpMigration
        .split(';')
        .map((statement) => statement.trim())
        .filter(Boolean)
    const compositeCheck = statements.find((statement) =>
        /operation_fulfillment_proofs/i.test(statement) &&
        /\bCHECK\b/i.test(statement) &&
        /proof_kind/i.test(statement)
    ) || ''
    const manualCheck = statements.find((statement) =>
        /operation_manual_fulfillment_evidence/i.test(statement) &&
        /\bCHECK\b/i.test(statement)
    ) || ''

    for (const field of [
        'baseline_id',
        'session_generation',
        'baseline_captured_at',
        'report_observed_at',
        'contract_observed_at',
        'report_row_fingerprint',
        'provider_amount',
        'currency',
        'report_package_name',
        'report_item_type',
        'dealer_context_hash',
    ]) {
        assert.match(compositeCheck, new RegExp(`"?${field}"?`, 'i'), field)
    }
    for (const field of [
        'invoice_no',
        'card_number_snapshot',
        'package_name_snapshot',
        'provider_amount',
        'currency',
        'evidence_source',
        'evidence_note',
        'observed_at',
        'actor_user_id',
    ]) {
        assert.match(manualCheck, new RegExp(`"?${field}"?`, 'i'), field)
    }

    const createClaim = statements.findIndex((statement) =>
        /CREATE TABLE\s+"provider_invoice_claims"/i.test(statement)
    )
    const backfillClaim = statements.findIndex((statement) =>
        /INSERT INTO\s+"provider_invoice_claims"/i.test(statement)
    )
    const uniqueClaim = statements.findIndex((statement) =>
        /CREATE UNIQUE INDEX/i.test(statement) &&
        /ON\s+"provider_invoice_claims"/i.test(statement) &&
        /bein_account_id/i.test(statement) &&
        /invoice_no/i.test(statement)
    )

    assert.ok(createClaim >= 0, 'shared provider invoice claim table must be created')
    assert.ok(backfillClaim > createClaim, 'legacy proof invoices must be backfilled into the shared registry')
    assert.ok(uniqueClaim > backfillClaim, 'cross-kind invoice uniqueness must be enabled after legacy backfill')
    assert.doesNotMatch(followUpMigration, /\bDROP\s+(TABLE|COLUMN|TYPE)\b/i)
})
