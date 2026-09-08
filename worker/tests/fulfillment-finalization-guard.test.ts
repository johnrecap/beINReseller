import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    validateAutomatedRenewalFulfillmentContext,
    type AutomatedRenewalFulfillmentContextInput,
} from '../src/lib/fulfillment-finalization'

const finalizerSource = readFileSync(
    join(process.cwd(), 'worker', 'src', 'lib', 'fulfillment-finalization.ts'),
    'utf8'
)

function validContext(
    providerPaymentState: 'CHARGED' | 'UNKNOWN' = 'CHARGED'
): AutomatedRenewalFulfillmentContextInput {
    const mutationStartedAt = new Date('2026-08-23T15:40:00.000Z')
    const baselineCapturedAt = new Date('2026-08-23T15:39:00.000Z')
    return {
        requestedOperationId: 'operation-1',
        providerPaymentState,
        verificationAttemptId: 'attempt-1',
        verificationAttemptNo: 1,
        baselineId: 'baseline-1',
        reservationGeneration: 7,
        operation: {
            id: 'operation-1',
            type: 'RENEW',
            status: 'COMPLETING',
            amount: 174,
            beinAccountId: 'bein-account-1',
            cardNumber: '7517687161',
            selectedPackage: {
                name: 'Premium 12 Months',
                price: '174.00',
            },
            providerPaymentState,
            providerMutationStartedAt: mutationStartedAt,
            providerMutationStage: 'FINAL_OK',
            fulfillmentAuthority: 'NONE',
            fulfillmentProofKind: null,
            manualFulfillmentEvidencePresent: false,
        },
        verification: {
            id: 'verification-1',
            state: 'VERIFYING',
            activeBaselineId: 'baseline-1',
            attemptCount: 1,
            lastOutcome: 'MATCHED',
        },
        latestAttempt: {
            id: 'attempt-1',
            verificationId: 'verification-1',
            baselineId: 'baseline-1',
            attemptNo: 1,
            outcome: 'MATCHED',
            completeScan: true,
            candidateCount: 1,
            candidateInvoiceNo: '53005527',
            reportObservedAt: new Date('2026-08-23T15:41:05.000Z'),
            contractObservedAt: new Date('2026-08-23T15:41:10.000Z'),
        },
        cardReservation: {
            operationId: 'operation-1',
            cardNumber: '7517687161',
            releasedAt: null,
        },
        providerAccountReservation: {
            operationId: 'operation-1',
            beinAccountId: 'bein-account-1',
            reservationGeneration: 7,
            releasedAt: null,
        },
        activeBaseline: {
            id: 'baseline-1',
            operationId: 'operation-1',
            beinAccountId: 'bein-account-1',
            cardNumberSnapshot: '7517687161',
            sessionGeneration: '7',
            dealerContextHash: 'b'.repeat(64),
            capturedAt: baselineCapturedAt,
        },
        proofCandidate: {
            operationId: 'operation-1',
            beinAccountId: 'bein-account-1',
            cardNumberSnapshot: '7517687161',
            invoiceNo: '53005527',
            proofKind: 'SOLD_REPORT_CONTRACT_CORRELATION',
            selectedPackageName: 'Premium 12 Months',
            contractPackageName: 'Premium 12 Months',
            contractStatus: 'Active',
            contractType: 'Renewal',
            contractStartDate: '23/08/2026',
            contractExpiryDate: '22/08/2027',
            verificationSource: 'POST_FINAL_PAY',
            providerCheckedAt: new Date('2026-08-23T15:41:10.000Z'),
            baselineId: 'baseline-1',
            sessionGeneration: '7',
            baselineCapturedAt,
            reportObservedAt: new Date('2026-08-23T15:41:05.000Z'),
            contractObservedAt: new Date('2026-08-23T15:41:10.000Z'),
            reportRowFingerprint: 'a'.repeat(64),
            providerAmount: '174.00',
            currency: 'USD',
            reportPackageName: 'Add Premium 12 Months',
            reportItemType: 'Card_CISCO',
            dealerContextHash: 'b'.repeat(64),
        },
    }
}

test('valid charged and unknown post-mutation contexts can reach the invoice claim', () => {
    assert.deepEqual(validateAutomatedRenewalFulfillmentContext(validContext('CHARGED')), { valid: true })
    assert.deepEqual(validateAutomatedRenewalFulfillmentContext(validContext('UNKNOWN')), { valid: true })
})

test('customer markup amount does not replace the selected provider package amount', () => {
    const input = validContext('CHARGED')
    input.operation.amount = 216

    assert.deepEqual(validateAutomatedRenewalFulfillmentContext(input), { valid: true })
    assert.equal(input.operation.selectedPackage && typeof input.operation.selectedPackage === 'object'
        ? (input.operation.selectedPackage as { price?: string }).price
        : null, '174.00')
})

test('2026-08-24 regression: all causal guards run before claim and the guarded update can only roll back', () => {
    const start = finalizerSource.indexOf('export async function finalizeAutomatedRenewalFulfillment')
    const end = finalizerSource.indexOf('function sameManualEvidence', start)
    assert.ok(start >= 0 && end > start)
    const automatedFinalizer = finalizerSource.slice(start, end)
    const verificationAttemptLockIndex = automatedFinalizer.indexOf('lockCurrentVerificationAttempt(')
    const cardReservationLockIndex = automatedFinalizer.indexOf('lockCardLifecycleReservation(')
    const accountReservationLockIndex = automatedFinalizer.indexOf('lockProviderAccountCausalReservation(')
    const validationIndex = automatedFinalizer.indexOf('validateAutomatedRenewalFulfillmentContext(')
    const refundIndex = automatedFinalizer.indexOf('await hasRefund(')
    const chargedLedgerIndex = automatedFinalizer.indexOf('lockChargedSpendLedgerAccount(')
    const claimIndex = automatedFinalizer.indexOf('claimOperationFulfillmentProofInTransaction(')
    assert.ok(verificationAttemptLockIndex >= 0)
    assert.ok(cardReservationLockIndex > verificationAttemptLockIndex)
    assert.ok(accountReservationLockIndex > cardReservationLockIndex)
    assert.ok(validationIndex > accountReservationLockIndex)
    assert.ok(refundIndex > validationIndex)
    assert.ok(chargedLedgerIndex > refundIndex)
    assert.ok(claimIndex > chargedLedgerIndex)

    const guardedUpdate = automatedFinalizer.slice(automatedFinalizer.indexOf('tx.operation.updateMany({'))
    assert.match(guardedUpdate, /type:\s*'RENEW'/)
    assert.match(guardedUpdate, /beinAccountId:\s*input\.proofCandidate\.beinAccountId/)
    assert.match(guardedUpdate, /cardNumber:\s*input\.proofCandidate\.cardNumberSnapshot/)
    assert.match(guardedUpdate, /providerPaymentState:\s*input\.providerPaymentState/)
    assert.match(guardedUpdate, /providerMutationStartedAt:\s*operation\.providerMutationStartedAt/)
    assert.match(guardedUpdate, /providerMutationStage:\s*'FINAL_OK'/)
    assert.match(guardedUpdate, /throw new Error\('OPERATION_FINALIZATION_CONFLICT'\)/)
})

test('exact completed replay remains valid with released reservations and verified state', () => {
    const input = validContext()
    input.operation.status = 'COMPLETED'
    input.operation.fulfillmentAuthority = 'AUTOMATED_COMPOSITE'
    input.operation.fulfillmentProofKind = 'SOLD_REPORT_CONTRACT_CORRELATION'
    input.verification.state = 'VERIFIED'
    input.cardReservation!.releasedAt = new Date('2026-08-23T15:42:00.000Z')
    input.providerAccountReservation!.releasedAt = new Date('2026-08-23T15:42:00.000Z')

    assert.deepEqual(validateAutomatedRenewalFulfillmentContext(input), { valid: true })
})

const invalidContexts: Array<{
    name: string
    reason: string
    mutate: (input: AutomatedRenewalFulfillmentContextInput) => void
}> = [
    {
        name: 'candidate belongs to another operation',
        reason: 'OPERATION_ID_MISMATCH',
        mutate: (input) => { input.proofCandidate.operationId = 'operation-2' },
    },
    {
        name: 'operation is not a renewal',
        reason: 'OPERATION_TYPE_MISMATCH',
        mutate: (input) => { input.operation.type = 'CHECK_BALANCE' },
    },
    {
        name: 'operation status is outside the finalization set',
        reason: 'OPERATION_STATUS_MISMATCH',
        mutate: (input) => { input.operation.status = 'PENDING' },
    },
    {
        name: 'stored payment state disagrees with the finalizer input',
        reason: 'PROVIDER_PAYMENT_STATE_MISMATCH',
        mutate: (input) => { input.operation.providerPaymentState = 'UNKNOWN' },
    },
    {
        name: 'durable final mutation marker is absent',
        reason: 'FINAL_MUTATION_MARKER_MISSING',
        mutate: (input) => { input.operation.providerMutationStartedAt = null },
    },
    {
        name: 'provider account differs from the proof',
        reason: 'PROVIDER_ACCOUNT_MISMATCH',
        mutate: (input) => { input.operation.beinAccountId = 'bein-account-2' },
    },
    {
        name: 'card differs from the proof',
        reason: 'CARD_CONTEXT_MISMATCH',
        mutate: (input) => { input.operation.cardNumber = '7517687162' },
    },
    {
        name: 'card reservation is missing',
        reason: 'CARD_RESERVATION_MISMATCH',
        mutate: (input) => { input.cardReservation = null },
    },
    {
        name: 'card reservation was released',
        reason: 'CARD_RESERVATION_MISMATCH',
        mutate: (input) => { input.cardReservation!.releasedAt = new Date('2026-08-23T15:40:30.000Z') },
    },
    {
        name: 'card reservation belongs to another operation',
        reason: 'CARD_RESERVATION_MISMATCH',
        mutate: (input) => { input.cardReservation!.operationId = 'operation-2' },
    },
    {
        name: 'card reservation is for another card',
        reason: 'CARD_RESERVATION_MISMATCH',
        mutate: (input) => { input.cardReservation!.cardNumber = '7517687162' },
    },
    {
        name: 'provider account reservation is missing',
        reason: 'PROVIDER_RESERVATION_MISMATCH',
        mutate: (input) => { input.providerAccountReservation = null },
    },
    {
        name: 'provider account reservation was released',
        reason: 'PROVIDER_RESERVATION_MISMATCH',
        mutate: (input) => {
            input.providerAccountReservation!.releasedAt = new Date('2026-08-23T15:40:30.000Z')
        },
    },
    {
        name: 'provider account reservation belongs to another operation',
        reason: 'PROVIDER_RESERVATION_MISMATCH',
        mutate: (input) => { input.providerAccountReservation!.operationId = 'operation-2' },
    },
    {
        name: 'provider account reservation is for another account',
        reason: 'PROVIDER_RESERVATION_MISMATCH',
        mutate: (input) => { input.providerAccountReservation!.beinAccountId = 'bein-account-2' },
    },
    {
        name: 'provider reservation generation differs from the baseline and proof',
        reason: 'RESERVATION_GENERATION_MISMATCH',
        mutate: (input) => { input.providerAccountReservation!.reservationGeneration = 8 },
    },
    {
        name: 'requested reservation generation differs from the locked reservation',
        reason: 'RESERVATION_GENERATION_MISMATCH',
        mutate: (input) => { input.reservationGeneration = 8 },
    },
    {
        name: 'latest verification attempt id differs from the finalizer request',
        reason: 'VERIFICATION_ATTEMPT_MISMATCH',
        mutate: (input) => { input.latestAttempt.id = 'attempt-2' },
    },
    {
        name: 'latest verification attempt is not matched',
        reason: 'VERIFICATION_ATTEMPT_MISMATCH',
        mutate: (input) => {
            input.latestAttempt.outcome = 'VALID_NO_MATCH'
            input.verification.lastOutcome = 'VALID_NO_MATCH'
        },
    },
    {
        name: 'verification state is already terminal before a new proof claim',
        reason: 'VERIFICATION_STATE_MISMATCH',
        mutate: (input) => { input.verification.state = 'VERIFIED' },
    },
    {
        name: 'verification active baseline differs from the finalizer request',
        reason: 'ACTIVE_BASELINE_MISMATCH',
        mutate: (input) => { input.verification.activeBaselineId = 'baseline-2' },
    },
    {
        name: 'latest attempt candidate invoice differs from the proof candidate',
        reason: 'VERIFICATION_INVOICE_MISMATCH',
        mutate: (input) => { input.latestAttempt.candidateInvoiceNo = '53005528' },
    },
    {
        name: 'selected package differs from the proof',
        reason: 'PACKAGE_CONTEXT_MISMATCH',
        mutate: (input) => {
            input.operation.selectedPackage = { name: 'Premium 6 Months', price: '174.00' }
        },
    },
    {
        name: 'selected package amount differs from the report amount',
        reason: 'AMOUNT_CONTEXT_MISMATCH',
        mutate: (input) => {
            input.operation.selectedPackage = { name: 'Premium 12 Months', price: '216.00' }
        },
    },
    {
        name: 'candidate baseline is not the active baseline',
        reason: 'ACTIVE_BASELINE_MISMATCH',
        mutate: (input) => { input.activeBaseline.id = 'baseline-2' },
    },
    {
        name: 'baseline is not strictly before the provider mutation',
        reason: 'EVIDENCE_CHRONOLOGY_MISMATCH',
        mutate: (input) => {
            input.activeBaseline.capturedAt = new Date('2026-08-23T15:40:00.000Z')
            input.proofCandidate.baselineCapturedAt = new Date('2026-08-23T15:40:00.000Z')
        },
    },
    {
        name: 'report observation predates the provider mutation',
        reason: 'EVIDENCE_CHRONOLOGY_MISMATCH',
        mutate: (input) => {
            const observedAt = new Date('2026-08-23T15:39:59.999Z')
            input.proofCandidate.reportObservedAt = observedAt
            input.latestAttempt.reportObservedAt = observedAt
        },
    },
    {
        name: 'manual evidence already owns fulfillment authority',
        reason: 'FULFILLMENT_AUTHORITY_CONFLICT',
        mutate: (input) => { input.operation.manualFulfillmentEvidencePresent = true },
    },
]

for (const scenario of invalidContexts) {
    test(`invoice claim gate rejects when ${scenario.name}`, () => {
        const input = validContext()
        scenario.mutate(input)
        assert.deepEqual(validateAutomatedRenewalFulfillmentContext(input), {
            valid: false,
            reason: scenario.reason,
        })
    })
}
