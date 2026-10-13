export type ProviderPaymentState = 'NOT_SUBMITTED' | 'CHARGED' | 'NOT_CHARGED' | 'UNKNOWN'

export type FulfillmentState =
    | 'UNVERIFIED'
    | 'VERIFYING'
    | 'VERIFIED'
    | 'NOT_FOUND'
    | 'CHECK_FAILED'
    | 'PROOF_CONFLICT'

export type FulfillmentVerificationOutcome =
    | 'MATCHED'
    | 'VALID_NO_MATCH'
    | 'REPORT_ONLY'
    | 'CONTRACT_ONLY'
    | 'INCOMPLETE_SCAN'
    | 'CHECK_FAILED'
    | 'PROOF_CONFLICT'

export type FulfillmentProofMode = 'REVIEW_ONLY' | 'ENFORCE'

export type FulfillmentProofKind =
    | 'LEGACY_CONTRACT_ONLY'
    | 'SOLD_REPORT_CONTRACT_CORRELATION'
    | 'SOLD_REPORT_SAME_DAY'

export type FulfillmentAuthority =
    | 'NONE'
    | 'AUTOMATED_COMPOSITE'
    | 'AUTOMATED_REPORT'
    | 'MANUAL_PROVIDER_CONFIRMATION'

export type FinalPayFinancialOutcome =
    | 'CONFIRMED_SUCCESS'
    | 'CONFIRMED_NOT_CHARGED'
    | 'UNCERTAIN_REVIEW_REQUIRED'

export type FulfillmentProofClaimStatus =
    | 'CLAIMED'
    | 'ALREADY_CLAIMED'
    | 'INVALID_INVOICE'
    | 'OPERATION_PROOF_CONFLICT'
    | 'INVOICE_ALREADY_USED'

export type RenewalTerminalDecision =
    | 'COMPLETE'
    | 'REVIEW_REQUIRED'
    | 'FAIL_AND_REFUND'
    | 'PRE_PAY_FAILURE'

export function mapProviderPaymentState(
    financialOutcome: FinalPayFinancialOutcome,
    finalPayMayHaveStarted: boolean
): ProviderPaymentState {
    if (!finalPayMayHaveStarted) return 'NOT_SUBMITTED'
    if (financialOutcome === 'CONFIRMED_SUCCESS') return 'CHARGED'
    if (financialOutcome === 'CONFIRMED_NOT_CHARGED') return 'NOT_CHARGED'
    return 'UNKNOWN'
}

export function mapProofClaimToFulfillmentState(
    claimStatus: FulfillmentProofClaimStatus
): FulfillmentState {
    if (claimStatus === 'CLAIMED' || claimStatus === 'ALREADY_CLAIMED') return 'VERIFIED'
    return 'PROOF_CONFLICT'
}

export function mapVerificationOutcomeToFulfillmentState(input: {
    outcome: FulfillmentVerificationOutcome
    proofMode: FulfillmentProofMode
    compositeProofClaimed: boolean
}): FulfillmentState {
    if (input.outcome === 'MATCHED') {
        if (input.proofMode === 'REVIEW_ONLY') return 'UNVERIFIED'
        return input.compositeProofClaimed ? 'VERIFIED' : 'VERIFYING'
    }
    if (input.outcome === 'VALID_NO_MATCH' || input.outcome === 'REPORT_ONLY') {
        return 'NOT_FOUND'
    }
    if (input.outcome === 'INCOMPLETE_SCAN' || input.outcome === 'CHECK_FAILED') {
        return 'CHECK_FAILED'
    }
    return 'PROOF_CONFLICT'
}

export function decideRenewalTerminalState(input: {
    providerPaymentState: ProviderPaymentState
    fulfillmentState: FulfillmentState
    fulfillmentAuthority?: FulfillmentAuthority
    proofKind?: FulfillmentProofKind | null
    manualEvidenceComplete?: boolean
    verificationOutcome?: FulfillmentVerificationOutcome | null
}): { decision: RenewalTerminalDecision; refundAllowed: boolean } {
    if (input.fulfillmentState === 'VERIFIED') {
        const automatedAuthority =
            (input.fulfillmentAuthority === 'AUTOMATED_COMPOSITE' &&
                input.proofKind === 'SOLD_REPORT_CONTRACT_CORRELATION') ||
            (input.fulfillmentAuthority === 'AUTOMATED_REPORT' &&
                input.proofKind === 'SOLD_REPORT_SAME_DAY')
        const manualAuthority =
            input.fulfillmentAuthority === 'MANUAL_PROVIDER_CONFIRMATION' &&
            input.manualEvidenceComplete === true
        const paymentPermitsCompletion =
            input.providerPaymentState === 'CHARGED' ||
            input.providerPaymentState === 'UNKNOWN'

        return automatedAuthority || manualAuthority
            ? paymentPermitsCompletion
                ? { decision: 'COMPLETE', refundAllowed: false }
                : { decision: 'REVIEW_REQUIRED', refundAllowed: false }
            : { decision: 'REVIEW_REQUIRED', refundAllowed: false }
    }
    if (input.providerPaymentState === 'NOT_SUBMITTED') {
        return { decision: 'PRE_PAY_FAILURE', refundAllowed: true }
    }
    if (
        input.providerPaymentState === 'NOT_CHARGED' &&
        input.fulfillmentState === 'NOT_FOUND' &&
        input.verificationOutcome === 'VALID_NO_MATCH'
    ) {
        return { decision: 'FAIL_AND_REFUND', refundAllowed: true }
    }
    return { decision: 'REVIEW_REQUIRED', refundAllowed: false }
}
