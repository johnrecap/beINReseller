import test from 'node:test'
import assert from 'node:assert/strict'
import {
    decideRenewalTerminalState,
    mapVerificationOutcomeToFulfillmentState,
    mapProviderPaymentState,
    type FulfillmentState,
    type FulfillmentVerificationOutcome,
} from '../../shared/operations/renewal-fulfillment'

test('matching provider balance debit proves charge but not fulfillment', () => {
    assert.equal(mapProviderPaymentState('CONFIRMED_SUCCESS', true), 'CHARGED')
    assert.deepEqual(
        decideRenewalTerminalState({ providerPaymentState: 'CHARGED', fulfillmentState: 'UNVERIFIED' }),
        { decision: 'REVIEW_REQUIRED', refundAllowed: false }
    )
})

test('only verified fulfillment can complete a charged renewal', () => {
    assert.deepEqual(
        decideRenewalTerminalState({
            providerPaymentState: 'CHARGED',
            fulfillmentState: 'VERIFIED',
            fulfillmentAuthority: 'AUTOMATED_COMPOSITE',
            proofKind: 'SOLD_REPORT_CONTRACT_CORRELATION',
        }),
        { decision: 'COMPLETE', refundAllowed: false }
    )
})

test('verification outcome mapping keeps review-only matches unverified until structured manual review', () => {
    assert.equal(mapVerificationOutcomeToFulfillmentState({
        outcome: 'MATCHED',
        proofMode: 'REVIEW_ONLY',
        compositeProofClaimed: false,
    }), 'UNVERIFIED')

    assert.equal(mapVerificationOutcomeToFulfillmentState({
        outcome: 'MATCHED',
        proofMode: 'ENFORCE',
        compositeProofClaimed: false,
    }), 'VERIFYING')

    assert.equal(mapVerificationOutcomeToFulfillmentState({
        outcome: 'MATCHED',
        proofMode: 'ENFORCE',
        compositeProofClaimed: true,
    }), 'VERIFIED')
})

test('all non-matched verification outcomes map to safe fulfillment states', () => {
    const cases: Array<[FulfillmentVerificationOutcome, FulfillmentState]> = [
        ['VALID_NO_MATCH', 'NOT_FOUND'],
        ['REPORT_ONLY', 'NOT_FOUND'],
        ['CONTRACT_ONLY', 'PROOF_CONFLICT'],
        ['INCOMPLETE_SCAN', 'CHECK_FAILED'],
        ['CHECK_FAILED', 'CHECK_FAILED'],
        ['PROOF_CONFLICT', 'PROOF_CONFLICT'],
    ]

    for (const [outcome, expected] of cases) {
        assert.equal(mapVerificationOutcomeToFulfillmentState({
            outcome,
            proofMode: 'ENFORCE',
            compositeProofClaimed: false,
        }), expected, outcome)
    }
})

test('legacy contract-only proof cannot authorize renewal completion', () => {
    assert.deepEqual(decideRenewalTerminalState({
        providerPaymentState: 'CHARGED',
        fulfillmentState: 'VERIFIED',
        fulfillmentAuthority: 'AUTOMATED_COMPOSITE',
        proofKind: 'LEGACY_CONTRACT_ONLY',
    }), { decision: 'REVIEW_REQUIRED', refundAllowed: false })
})

test('complete structured manual evidence can authorize a labeled completion in review-only mode', () => {
    assert.deepEqual(decideRenewalTerminalState({
        providerPaymentState: 'UNKNOWN',
        fulfillmentState: 'VERIFIED',
        fulfillmentAuthority: 'MANUAL_PROVIDER_CONFIRMATION',
        proofKind: null,
        manualEvidenceComplete: true,
    }), { decision: 'COMPLETE', refundAllowed: false })

    assert.deepEqual(decideRenewalTerminalState({
        providerPaymentState: 'UNKNOWN',
        fulfillmentState: 'VERIFIED',
        fulfillmentAuthority: 'MANUAL_PROVIDER_CONFIRMATION',
        proofKind: null,
        manualEvidenceComplete: false,
    }), { decision: 'REVIEW_REQUIRED', refundAllowed: false })
})

test('not-charged plus verified fulfillment is contradictory and never completes or refunds', () => {
    assert.deepEqual(decideRenewalTerminalState({
        providerPaymentState: 'NOT_CHARGED',
        fulfillmentState: 'VERIFIED',
        fulfillmentAuthority: 'AUTOMATED_COMPOSITE',
        proofKind: 'SOLD_REPORT_CONTRACT_CORRELATION',
    }), { decision: 'REVIEW_REQUIRED', refundAllowed: false })
})

test('no charge and no contract permits the existing safe refund path', () => {
    assert.deepEqual(
        decideRenewalTerminalState({
            providerPaymentState: 'NOT_CHARGED',
            fulfillmentState: 'NOT_FOUND',
            verificationOutcome: 'VALID_NO_MATCH',
        }),
        { decision: 'FAIL_AND_REFUND', refundAllowed: true }
    )
})

test('report-only evidence never authorizes a no-charge refund', () => {
    assert.deepEqual(
        decideRenewalTerminalState({
            providerPaymentState: 'NOT_CHARGED',
            fulfillmentState: 'NOT_FOUND',
            verificationOutcome: 'REPORT_ONLY',
        }),
        { decision: 'REVIEW_REQUIRED', refundAllowed: false }
    )
})

test('unknown payment and every unsafe fulfillment outcome require review', () => {
    const unsafeFulfillmentStates: FulfillmentState[] = [
        'UNVERIFIED',
        'VERIFYING',
        'NOT_FOUND',
        'CHECK_FAILED',
        'PROOF_CONFLICT',
    ]

    for (const fulfillmentState of unsafeFulfillmentStates) {
        assert.deepEqual(
            decideRenewalTerminalState({ providerPaymentState: 'UNKNOWN', fulfillmentState }),
            { decision: 'REVIEW_REQUIRED', refundAllowed: false }
        )
    }
})

test('a request that was not submitted remains a pre-pay failure', () => {
    assert.equal(mapProviderPaymentState('CONFIRMED_NOT_CHARGED', false), 'NOT_SUBMITTED')
    assert.deepEqual(
        decideRenewalTerminalState({ providerPaymentState: 'NOT_SUBMITTED', fulfillmentState: 'UNVERIFIED' }),
        { decision: 'PRE_PAY_FAILURE', refundAllowed: true }
    )
})
